/*
 Copyright 2017 Aleksandar Jankovic

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

const express = require('express');
const dbUser = require('../db/connectors/user');
const appConfig = require('../config/defaults/config').app;
const dbConfig = require('../config/defaults/config').databasePopulation;
const dbDevice = require('../db/connectors/device');
const teamHandler = require('./socketHandlers/team');
const lanternHackingHandler = require('./socketHandlers/lanternHacking');
const locationHandler = require('./socketHandlers/position');
const deviceHandler = require('./socketHandlers/device');
const walletHandler = require('./socketHandlers/wallet');
const calibrationJobHandler = require('./socketHandlers/calibrationMission');
const simpleMessageHandler = require('./socketHandlers/simpleMsg');
const hackingHandler = require('./socketHandlers/hacking');
const chatHandler = require('./socketHandlers/chat');
const userHandler = require('./socketHandlers/user');
const gameCodeHandler = require('./socketHandlers/gameCode');
const docFileHandler = require('./socketHandlers/docFile');
const forumHandler = require('./socketHandlers/forum');

const router = new express.Router();

/**
 * @param {Object} io - Socket.IO
 * @returns {Object} Router
 */
function handle(io) {
  router.get('/control', (req, res) => {
    res.render('control', {
      title: appConfig.title,
      gMapsKey: appConfig.gMapsKey,
      socketPath: appConfig.socketPath,
      mainJs: 'scripts/control.js',
      mainCss: !Number.isNaN(req.query.style) ? `styles/${req.query.style}.css` : 'styles/control.css',
    });
  });

  router.get('/', (req, res) => {
    res.render('index', {
      title: appConfig.title,
      gMapsKey: appConfig.gMapsKey,
      socketPath: appConfig.socketPath,
      mainJs: 'scripts/main.js',
      mainCss: !Number.isNaN(req.query.style) ? `styles/${req.query.style}.css` : 'styles/main.css',
      dyslexic: req.query.dyslexic,
    });
  });

  io.on('connection', (socket) => {
    socket.join(dbConfig.rooms.public.roomName);
    socket.join(dbConfig.rooms.bcast.roomName);
    socket.join(dbConfig.rooms.important.roomName);
    socket.join(dbConfig.rooms.news.roomName);
    socket.join(dbConfig.rooms.schedule.roomName);

    socket.emit('startup', {
      data: {
        defaultLanguage: appConfig.defaultLanguage,
        forceFullscreen: appConfig.forceFullscreen,
        gpsTracking: appConfig.gpsTracking,
        customFlags: appConfig.customFlags,
        centerLat: appConfig.centerLat,
        centerLong: appConfig.centerLong,
        cornerOneLat: appConfig.cornerOneLat,
        cornerOneLong: appConfig.cornerOneLong,
        cornerTwoLat: appConfig.cornerTwoLat,
        cornerTwoLong: appConfig.cornerTwoLong,
        defaultZoomLevel: appConfig.defaultZoomLevel,
        radioChannels: appConfig.radioChannels,
        yearModification: appConfig.yearModification,
        mode: appConfig.mode,
        welcomeMessage: appConfig.welcomeMessage,
        requiresVerification: appConfig.userVerify,
        showDevInfo: appConfig.showDevInfo,
        dayModification: appConfig.dayModification,
      },
    });

    socket.on('disconnect', (params, callback = () => {}) => {
      dbDevice.getDeviceBySocketId({
        socketId: socket.id,
        callback: (deviceData) => {
          if (deviceData.error) {
            return;
          }

          const device = {
            deviceId: deviceData.data.device.deviceId,
          };

          dbDevice.updateDevice({
            device,
            callback: () => {},
          });
        },
      });
      dbUser.getUserBySocketId({
        socketId: socket.id,
        callback: ({ error, data }) => {
          if (error) {
            callback({ error });

            return;
          }

          const { user } = data;

          dbUser.updateUserSocketId({
            username: user.username,
            callback: () => {},
          });
          dbUser.updateUserOnline({
            username: user.username,
            online: false,
            callback: () => {},
          });
        },
      });
    });

    userHandler.handle(socket, io);
    chatHandler.handle(socket, io);
    deviceHandler.handle(socket, io);
    teamHandler.handle(socket, io);
    lanternHackingHandler.handle(socket, io);
    locationHandler.handle(socket, io);
    walletHandler.handle(socket, io);
    calibrationJobHandler.handle(socket, io);
    simpleMessageHandler.handle(socket, io);
    hackingHandler.handle(socket, io);
    gameCodeHandler.handle(socket, io);
    docFileHandler.handle(socket, io);
    forumHandler.handle(socket, io);
  });

  return router;
}

module.exports = handle;
