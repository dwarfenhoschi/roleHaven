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

const dbTransaction = require('../../db/connectors/transaction');
const dbWallet = require('../../db/connectors/wallet');
const databasePopulation = require('../../config/defaults/config').databasePopulation;
const manager = require('../../socketHelpers/manager');
const objectValidator = require('../../utils/objectValidator');
const errorCreator = require('../../objects/error/errorCreator');
const dbUser = require('../../db/connectors/user');

/**
 * @param {object} socket - Socket.IO socket
 * @param {object} io - Socket.io io
 */
function handle(socket, io) {
  socket.on('getWallet', (params, callback = () => {}) => {
    manager.userIsAllowed(socket.id, databasePopulation.commands.getWallet.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed || !user) {
        callback({ err: new errorCreator.Database() });

        return;
      }

      dbWallet.getWallet(user.userName, (err, wallet) => {
        if (err) {
          callback({ err: new errorCreator.Database() });

          return;
        }

        callback({ data: { wallet } });
      });
    });
  });

  socket.on('getAllTransactions', (params, callback = () => {}) => {
    manager.userIsAllowed(socket.id, databasePopulation.commands.getWallet.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed || !user) {
        callback({ err: new errorCreator.Database() });

        return;
      }

      manager.getAllUserTransactions({
        userName: user.userName,
        callback: ({ error, data }) => {
          callback({ error, data });
        },
      });
    });
  });

  socket.on('createTransaction', ({ transaction }, callback = () => {}) => {
    if (!objectValidator.isValidData({ transaction }, { transaction: { to: true, amount: true } })) {
      callback({ error: new errorCreator.InvalidData() });

      return;
    } else if (isNaN(transaction.amount)) {
      callback({ error: new errorCreator.InvalidData() });

      return;
    }

    manager.userIsAllowed(socket.id, databasePopulation.commands.getWallet.commandName, (allowErr, allowed, user) => {
      if (allowErr || !allowed || !user) {
        callback({ error: new errorCreator.Database() });

        return;
      }

      manager.createTransaction({
        transaction,
        user,
        io,
        callback: ({ error, data }) => {
          callback({ error, data });
        },
      });
    });
  });
}

exports.handle = handle;