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

const messageManager = require('../../managers/messages');

/* eslint-disable no-param-reassign */

/**
 * @param {object} socket - Socket.Io socket.
 * @param {object} io - Socket.Io.
 */
function handle(socket, io) {
  socket.on('sendChatMsg', (params, callback = () => {}) => {
    params.callback = callback;
    params.io = io;
    params.socket = socket;

    messageManager.sendChatMsg(params);
  });

  socket.on('sendWhisperMsg', (params, callback = () => {}) => {
    params.callback = callback;
    params.io = io;
    params.socket = socket;

    messageManager.sendWhisperMsg(params);
  });

  socket.on('sendBroadcastMsg', (params, callback = () => {}) => {
    params.callback = callback;
    params.io = io;
    params.socket = socket;

    messageManager.sendBroadcastMsg(params);
  });

  socket.on('updateMessage', (params, callback = () => {}) => {
    params.callback = callback;
    params.io = io;
    params.socket = socket;

    messageManager.updateMsg(params);
  });

  socket.on('removeMessage', (params, callback = () => {}) => {
    params.callback = callback;
    params.io = io;
    params.socket = socket;

    messageManager.removeMesssage(params);
  });

  socket.on('getMessage', (params, callback = () => {}) => {
    params.callback = callback;
    params.io = io;
    params.socket = socket;

    messageManager.getMessageById(params);
  });

  socket.on('getMessages', (params, callback = () => {}) => {
    params.callback = callback;
    params.io = io;
    params.socket = socket;

    if (params.fullHistory) {
      messageManager.getFullHistory(params);
    } else {
      messageManager.getMessagesByFollowed(params);
    }
  });

  socket.on('getMessagesByRoom', (params, callback = () => {}) => {
    params.callback = callback;
    params.io = io;
    params.socket = socket;

    messageManager.getMessagesByRoom(params);
  });
}

exports.handle = handle;
