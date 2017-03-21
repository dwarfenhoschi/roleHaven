/*
 Copyright 2015 Aleksandar Jankovic

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

'use strict';

const mongoose = require('mongoose');
const logger = require('../../utils/logger');

const mapPositionSchema = new mongoose.Schema({
  positionName: { type: String, unique: true },
  deviceId: String,
  position: {},
  isStatic: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false },
  owner: String,
  type: String,
  group: String,
  lastUpdated: Date,
  title: String,
  description: [String],
}, { collection: 'mapPositions' });

const MapPosition = mongoose.model('MapPosition', mapPositionSchema);

/**
 * Update position
 * @param {Object} params - Parameters
 * @param {string} params.positionName - Name of the position
 * @param {Object} params.position - Position
 * @param {string} params.type - Type of position
 * @param {boolean} [params.isStatic] - Is the position static? (most commonly used on everything non-user)
 * @param {string} [params.group] - Name of the grop that the position belongs to (most commonly used by user)
 * @param {Function} params.callback - Callback
 */
function updatePosition({ positionName, position, owner, isStatic, type, group, description, isPublic, lastUpdated = new Date(), callback }) {
  const query = { $and: [{ positionName }, { owner }] };
  const update = {
    position,
    type,
    lastUpdated,
    isPublic,
  };
  const options = { upsert: true, new: true };

  if (typeof group !== 'undefined') {
    update.group = group;
  }

  if (typeof isStatic !== 'undefined') {
    update.isStatic = isStatic;
  }

  if (typeof description !== 'undefined') {
    update.description = description;
  }

  MapPosition.update(query, update, options).lean().exec((err, mapPosition) => {
    if (err) {
      logger.sendErrorMsg({
        code: logger.ErrorCodes.db,
        text: ['Failed to update map position'],
        err,
      });
    }

    callback(err, mapPosition);
  });
}

/**
 * Get position
 * @param {string} positionName - Name of the position
 * @param {Function} callback - Callback
 */
function getPosition(positionName, callback) {
  const query = { positionName };

  MapPosition.findOne(query).lean().exec((err, position) => {
    if (err) {
      logger.sendErrorMsg({
        code: logger.ErrorCodes.db,
        text: [`Failed to get position ${positionName}`],
        err,
      });
    }

    callback(err, position);
  });
}

/**
 * Get multiple positions
 * @param {string[]} positionNames - Name of the positions
 * @param {Function} callback - Callback
 */
function getPositions(positionNames, callback) {
  const query = { positionName: { $in: positionNames } };

  MapPosition.find(query).lean().exec((mapErr, positions) => {
    if (mapErr) {
      logger.sendErrorMsg({
        code: logger.ErrorCodes.db,
        text: ['Failed to get all user positions'],
        mapErr,
      });
    }

    callback(mapErr, positions);
  });
}

/**
 * Get all static positions
 * @param {Function} callback - Callback
 */
function getAllStaticPositions(callback) {
  const query = { isStatic: true };

  MapPosition.find(query).lean().exec((err, staticPositions) => {
    if (err) {
      logger.sendErrorMsg({
        code: logger.ErrorCodes.db,
        text: ['Failed to get static positions'],
        err,
      });
    }

    callback(err, staticPositions);
  });
}

/**
 * Get all custom locations
 * @param {Function} callback - Callback
 */
function getCustomLocations(owner, callback) {
  const query = { $and: [{ type: 'custom' }, { $or: [{ isPublic: true }, { owner }] }] };

  MapPosition.find(query).lean().exec((err, customLocations) => {
    if (err) {
      logger.sendErrorMsg({
        code: logger.ErrorCodes.db,
        text: ['Failed to get custom locations'],
        err,
      });
    }

    console.log('custom', customLocations);

    callback(err, customLocations);
  });
}

exports.updateLocation = updatePosition;
exports.getAllStaticPositions = getAllStaticPositions;
exports.getPosition = getPosition;
exports.getPositions = getPositions;
exports.getCustomLocations = getCustomLocations;
