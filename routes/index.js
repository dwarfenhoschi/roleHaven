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

const aliasHandler = require('./socketHandlers/aliases');
const authenticationHandler = require('./socketHandlers/authenticate');
const deviceHandler = require('./socketHandlers/devices');
const docFilesHandler = require('./socketHandlers/docFiles');
const forumPostHandler = require('./socketHandlers/forumPost');
const forumHandler = require('./socketHandlers/forums');
const forumThreadHandler = require('./socketHandlers/forumThreads');
const gameCodeHandler = require('./socketHandlers/gameCodes');
const messageHandler = require('./socketHandlers/messages');
const positionHandler = require('./socketHandlers/positions');
const roomHandler = require('./socketHandlers/rooms');
const simpleMsgHandler = require('./socketHandlers/simpleMsgs');
const teamHandler = require('./socketHandlers/teams');
const transactionHandler = require('./socketHandlers/transactions');
const userHandler = require('./socketHandlers/users');
const walletHandler = require('./socketHandlers/wallets');


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
    dbConfig.rooms.forEach((room) => {
      socket.join(room.objectId);
    });

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
        yearModification: appConfig.yearModification,
        mode: appConfig.mode,
        welcomeMessage: appConfig.welcomeMessage,
        userVerify: appConfig.userVerify,
        showDevInfo: appConfig.showDevInfo,
        dayModification: appConfig.dayModification,
      },
    });

    socket.on('disconnect', (params, callback = () => {}) => {
      dbDevice.updateDevice({
        device: {},
        deviceSocketId: socket.id,
        options: { resetSocket: true },
        callback: ({ error: updateError }) => {
          if (updateError) {
            callback({ error: updateError });

            return;
          }

          dbUser.updateOnline({
            isOnline: false,
            userSocketId: socket.id,
            callback: ({ error: userError }) => {
              if (userError) {
                callback({ error: userError });

                return;
              }

              callback({ data: { success: true } });
            },
          });
        },
      });
    });

    aliasHandler.handle(socket, io);
    authenticationHandler.handle(socket, io);
    deviceHandler.handle(socket, io);
    docFilesHandler.handle(socket, io);
    forumPostHandler.handle(socket, io);
    forumHandler.handle(socket, io);
    forumThreadHandler.handle(socket, io);
    gameCodeHandler.handle(socket, io);
    messageHandler.handle(socket, io);
    positionHandler.handle(socket, io);
    roomHandler.handle(socket, io);
    simpleMsgHandler.handle(socket, io);
    teamHandler.handle(socket, io);
    transactionHandler.handle(socket, io);
    userHandler.handle(socket, io);
    walletHandler.handle(socket, io);
  });

  return router;
}

module.exports = handle;
