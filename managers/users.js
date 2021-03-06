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

const dbUser = require('../db/connectors/user');
const dbWallet = require('../db/connectors/wallet');
const appConfig = require('../config/defaults/config').app;
const dbConfig = require('../config/defaults/config').databasePopulation;
const errorCreator = require('../objects/error/errorCreator');
const textTools = require('../utils/textTools');
const authenticator = require('../helpers/authenticator');
const roomManager = require('./rooms');
const deviceManager = require('../managers/devices');
const dbRoom = require('../db/connectors/room');
const dbDevice = require('../db/connectors/device');
const socketUtils = require('../utils/socketIo');

/**
 * Get user by Id and check if the user has access to it.
 * @param {Object} params - Parameters.
 * @param {Object} params.user - User retrieving the user.
 * @param {string} params.userId - Id of the user to retrieve.
 * @param {Function} params.callback - Callback
 * @param {string} [params.errorContentText] - Text to be printed on error.
 * @param {boolean} [params.shouldBeAdmin] - Does the user have to be an admin?
 * @param {boolean} [params.full] - Full.
 */
function getAccessibleUser({
  user,
  userId,
  callback,
  shouldBeAdmin,
  full,
  errorContentText = `userId ${userId}`,
}) {
  dbUser.getUserById({
    userId,
    callback: ({ error: userError, data: userData }) => {
      if (userError) {
        callback({ error: userError });

        return;
      } else if (!authenticator.hasAccessTo({
        shouldBeAdmin,
        toAuth: user,
        objectToAccess: userData.user,
      })) {
        callback({ error: new errorCreator.NotAllowed({ name: errorContentText }) });

        return;
      }

      const foundUser = userData.user;
      const filteredUser = {
        username: foundUser.username,
        lastOnline: foundUser.lastOnline,
        lastUpdated: foundUser.lastUpdated,
        isOnline: foundUser.isOnline,
      };

      callback({
        data: {
          user: full ? foundUser : filteredUser,
        },
      });
    },
  });
}

/**
 * Create a user.
 * @param {Object} params - Parameters.
 * @param {Object} params.user - User to create.
 * @param {string} params.origin - Name of the caller origin.
 * @param {Function} params.callback - Callback.
 * @param {Object} params.io - Socket.io. Used if socket is not set.
 * @param {Object} [params.socket] - Socket.io.
 */
function createUser({
  token,
  user,
  callback,
  socket,
  io,
  origin = dbConfig.OriginTypes.NONE,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: origin === dbConfig.OriginTypes.SOCKET && !appConfig.disallowSocketUserRegister ? dbConfig.apiCommands.CreateUserThroughSocket.name : dbConfig.apiCommands.CreateUser.name,
    callback: ({ error }) => {
      if (error) {
        callback({ error });

        return;
      } else if (!textTools.isAllowedFull(user.username)) {
        callback({ error: new errorCreator.InvalidCharacters({ name: `User name: ${user.username}` }) });

        return;
      } else if (user.username.length > appConfig.usernameMaxLength || user.password.length > appConfig.passwordMaxLength || user.registerDevice.length > appConfig.deviceIdLength) {
        callback({ error: new errorCreator.InvalidCharacters({ name: `User name length: ${appConfig.usernameMaxLength} Password length: ${appConfig.usernameMaxLength} Device length: ${appConfig.deviceIdLength}` }) });

        return;
      } else if (dbConfig.protectedNames.includes(user.username.toLowerCase())) {
        callback({ error: new errorCreator.InvalidCharacters({ name: `protected name ${user.username}` }) });

        return;
      }

      const newUser = user;
      newUser.isVerified = appConfig.userVerify;
      newUser.followingRooms = Object.keys(dbConfig.rooms).map(key => dbConfig.rooms[key].objectId);

      dbUser.createUser({
        user: newUser,
        callback: ({ error: userError, data: userData }) => {
          if (userError) {
            callback({ error: userError });

            return;
          }

          const createdUser = userData.user;

          dbRoom.createRoom({
            room: {
              ownerId: createdUser.objectId,
              roomName: createdUser.objectId,
              objectId: createdUser.objectId,
              visibility: dbConfig.AccessLevels.SUPERUSER,
              accessLevel: dbConfig.AccessLevels.SUPERUSER,
            },
            options: {
              shouldSetId: true,
              isFollower: true,
            },
            callback: ({ error: roomError, data: roomData }) => {
              if (roomError) {
                callback({ error: roomError });

                return;
              }

              const wallet = {
                objectId: createdUser.objectId,
                accessLevel: createdUser.accessLevel,
                ownerId: createdUser.objectId,
                amount: appConfig.defaultWalletAmount,
              };
              const walletOptions = { setId: true };

              dbWallet.createWallet({
                wallet,
                options: walletOptions,
                callback: ({ error: walletError, data: walletData }) => {
                  if (walletError) {
                    callback({ error: walletError });

                    return;
                  }


                  const dataToSend = {
                    data: {
                      user: {
                        objectId: createdUser.objectId,
                        username: createdUser.username,
                      },
                      changeType: dbConfig.ChangeTypes.CREATE,
                    },
                  };

                  if (socket) {
                    socket.broadcast.emit(dbConfig.EmitTypes.USER, dataToSend);
                  } else {
                    io.emit(dbConfig.EmitTypes.USER, dataToSend);
                  }

                  callback({
                    data: {
                      user: createdUser,
                      wallet: walletData.wallet,
                      room: roomData.room,
                      changeType: dbConfig.ChangeTypes.CREATE,
                    },
                  });
                },
              });
            },
          });
        },
      });
    },
  });
}

/**
 * Get users that the user has access to.
 * @param {Object} params - Parameters.
 * @param {Object} params.token - jwt.
 * @param {Function} params.callback - Callback.
 * @param {boolean} [params.includeInactive] - Should banned and unverified users be in the result?
 * @param {boolean} [params.full] - Should
 */
function getUsersByUser({
  token,
  includeInactive,
  callback,
  full,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: full || includeInactive ? dbConfig.apiCommands.GetFull.name : dbConfig.apiCommands.GetUsers.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const { user } = data;

      dbUser.getUsersByUser({
        user,
        full,
        includeInactive,
        callback,
      });
    },
  });
}

/**
 * Change password.
 * @param {Object} params - Parameters.
 * @param {string} params.password - Password.
 * @param {Function} params.callback - Callback.
 */
function changePassword({
  token,
  password,
  callback,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.ChangePassword.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const { user } = data;

      dbUser.updateUserPassword({
        password,
        userId: user.objectId,
        callback: ({ error: updateError }) => {
          if (updateError) {
            callback({ error: updateError });

            return;
          }

          callback({ data: { success: true } });
        },
      });
    },
  });
}

// TODO Fix access

/**
 * Get user by name.
 * @param {Object} params - Parameters.
 * @param {string} params.username - Name of the user to retrieve.
 * @param {Function} params.callback - Callback.
 */
function getUserByName({
  token,
  username,
  callback,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.GetUser.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      if (username === data.user.username) {
        callback({ data });

        return;
      }

      dbUser.getUserByName({
        username,
        callback: ({ error: userError, data: userData }) => {
          if (userError) {
            callback({ error: userError });

            return;
          } else if (userData.user.accessLevel >= data.user.accessLevel) {
            callback({ error: new errorCreator.NotAllowed({ name: 'retrieved user too high access' }) });

            return;
          }

          callback({ data: userData });
        },
      });
    },
  });
}

/**
 * Get user by Id.
 * @param {Object} params - Parameters.
 * @param {string} params.userId - Id of the user to retrieve.
 * @param {Function} params.callback - Callback.
 */
function getUserById({
  token,
  userId,
  callback,
  full,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.GetUser.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const { user } = data;

      if (userId === user.objectId) {
        callback({ data });

        return;
      }

      getAccessibleUser({
        user,
        full,
        userId,
        callback,
        shouldBeAdmin: full && dbConfig.apiCommands.GetFull.accessLevel > user.accessLevel,
      });
    },
  });
}

/**
 * Login user through socket client side.
 * @param {Object} params - Parameters.
 * @param {Object} params.user - User logging in.
 * @param {Object} params.device - Device logged in on.
 * @param {Object} params.io - Socket.io. Will be used if socket is not set.
 * @param {Function} params.callback - Callback.
 * @param {Object} [params.socket] - Socket.io.
 */
function login({
  user,
  device,
  socket,
  io,
  callback,
}) {
  dbUser.getUserByName({
    username: user.username,
    includeInactive: true,
    callback: ({ error: userError, data: userData }) => {
      if (userError) {
        callback({ error: userError });

        return;
      } else if (userData.user.isBanned) {
        callback({ error: new errorCreator.Banned({}) });

        return;
      } else if (!userData.user.isVerified) {
        callback({ error: new errorCreator.NeedsVerification({}) });

        return;
      }

      const authUser = userData.user;

      authenticator.createToken({
        userId: authUser.objectId,
        password: user.password,
        callback: ({ error, data: tokenData }) => {
          if (error) {
            callback({ error });

            return;
          }

          dbUser.updateOnline({
            userId: authUser.objectId,
            socketId: socket.id,
            isOnline: true,
            callback: (socketData) => {
              if (socketData.error) {
                callback({ error: socketData.error });

                return;
              }

              const newDevice = device;
              newDevice.lastUserId = authUser.objectId;
              newDevice.socketId = socket.id;

              dbDevice.updateDevice({
                deviceId: newDevice.objectId,
                device: newDevice,
                callback: ({ error: deviceError }) => {
                  if (deviceError) {
                    callback({ error: deviceError });

                    return;
                  }

                  const oldSocket = io.sockets.connected[authUser.socketId];

                  if (oldSocket) {
                    roomManager.leaveSocketRooms(socket);
                    oldSocket.emit(dbConfig.EmitTypes.LOGOUT);
                  }

                  socketUtils.joinRooms({
                    io,
                    roomIds: authUser.followingRooms,
                    socketId: socket.id,
                  });


                  callback({
                    data: {
                      token: tokenData.token,
                      user: authUser,
                    },
                  });
                },
              });
            },
          });
        },
      });
    },
  });
}

/**
 * Logout user.
 * @param {Object} params - Parameters.
 * @param {Object} params.device - The device of the user that is logging out.
 * @param {string} params.token jwt.
 * @param {Object} params.socket - Socket.io.
 * @param {Function} params.callback - Callback.
 */
function logout({
  device,
  token,
  socket,
  callback,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.Logout.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const authUser = data.user;

      dbUser.updateOnline({
        userId: authUser.objectId,
        isOnline: false,
        callback: ({ error: socketError }) => {
          if (socketError) {
            callback({ error: socketError });

            return;
          }

          const deviceToUpdate = device;
          deviceToUpdate.lastUserId = authUser.objectId;
          deviceToUpdate.socketId = '';

          deviceManager.updateDevice({
            device: deviceToUpdate,
            callback: ({ error: deviceError }) => {
              if (deviceError) {
                callback({ error: deviceError });

                return;
              }

              roomManager.leaveSocketRooms({ socket });

              callback({ data: { success: true } });
            },
          });
        },
      });
    },
  });
}

/**
 * Unban user.
 * @param {Object} params - Parameters.
 * @param {string} params.token - jwt token.
 * @param {Object} params.bannedUserId - ID of the user to unban.
 * @param {Function} params.callback - Callback.
 * @param {Object} params.io - Socket.io.
 */
function unbanUser({
  token,
  bannedUserId,
  callback,
  io,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.UnbanUser.name,
    callback: ({ error }) => {
      if (error) {
        callback({ error });

        return;
      }

      dbUser.updateBanUser({
        shouldBan: false,
        userId: bannedUserId,
        callback: ({ error: unbanError }) => {
          if (unbanError) {
            callback({ error: unbanError });

            return;
          }

          const dataToSend = {
            data: {
              user: {
                objectId: bannedUserId,
                isBanned: false,
              },
              changeType: dbConfig.ChangeTypes.UPDATE,
            },
          };

          io.emit(dbConfig.EmitTypes.USER, dataToSend);

          callback({ data: { success: true } });
        },
      });
    },
  });
}

/**
 * Ban user.
 * @param {Object} params - Parameters.
 * @param {Object} params.banUserId - ID of the user to ban.
 * @param {Object} params.io - socket-io.
 * @param {string} params.token - jwt.
 * @param {Function} params.callback - Callback.
 * @param {string} [params.reason] - Text describing why the user was banned.
 */
function banUser({
  banUserId,
  reason,
  io,
  token,
  callback,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.BanUser.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      } else if (banUserId === data.user.objectId) {
        callback({ error: new errorCreator.InvalidData({ name: 'cannot ban self' }) });

        return;
      }

      dbUser.updateBanUser({
        userId: banUserId,
        shouldBan: true,
        callback: ({ error: banError }) => {
          if (banError) {
            callback({ error: banError });

            return;
          }

          const bannedSocket = io.sockets.connected[banUserId];
          const banDataToSend = {
            data: {
              reason,
              user: { objectId: banUserId },
            },
          };
          const dataToSend = {
            data: {
              user: {
                objectId: banUserId,
                isBanned: true,
              },
              changeType: dbConfig.ChangeTypes.UPDATE,
            },
          };

          if (bannedSocket) {
            roomManager.leaveSocketRooms({ socket: bannedSocket });
          }

          io.to(banUserId).emit(dbConfig.EmitTypes.BAN, banDataToSend);
          io.emit(dbConfig.EmitTypes.USER, dataToSend);

          callback({ data: { success: true } });
        },
      });
    },
  });
}

/**
 * Verifies a user account and allows it to login.
 * @param {Object} params - Parameters.
 * @param {string} params.userIdToVerify - ID of the user to verify.
 * @param {string} params.token - jwt.
 * @param {Object} params.io - Socket.io. Will be used if socket is not set.
 * @param {Function} params.callback - Callback.
 */
function verifyUser({
  userIdToVerify,
  token,
  io,
  callback,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.VerifyUser.name,
    callback: ({ error }) => {
      if (error) {
        callback({ error });

        return;
      }

      dbUser.verifyUser({
        userId: userIdToVerify,
        callback: ({ error: verifyError }) => {
          if (verifyError) {
            callback({ error: verifyError });

            return;
          }

          const dataToSend = {
            data: {
              user: {
                objectId: userIdToVerify,
                isVerified: true,
              },
              changeType: dbConfig.ChangeTypes.UPDATE,
            },
          };

          io.emit(dbConfig.EmitTypes.USER, dataToSend);

          callback({ data: { success: true } });
        },
      });
    },
  });
}

/**
 * Update a user.
 * @param {Object} params - Parameters.
 * @param {string} params.token - jwt.
 * @param {Object} params.io - Socket.io.
 * @param {Function} params.callback - Callback.
 * @param {string} params.userId - Id of the user to update.
 * @param {Object} params.user - User parameter to update.
 * @param {Object} [params.options] - Update options.
 */
function updateUser({
  token,
  io,
  callback,
  userId,
  user,
  options,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.UpdateUser.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      } else if ((user.accessLevel || user.visibility || user.hasFullAccess) && userId === data.user.userId) {
        callback({ error: new errorCreator.NotAllowed({ name: 'update self' }) });

        return;
      }

      const authUser = data.user;

      getAccessibleUser({
        userId,
        user: authUser,
        shouldBeAdmin: true,
        callback: ({ error: userError }) => {
          if (userError) {
            callback({ error: userError });

            return;
          }

          dbUser.updateUser({
            user,
            options,
            userId,
            callback: ({ error: updateError, data: updateData }) => {
              if (updateError) {
                callback({ error: updateError });

                return;
              }

              const updatedUser = updateData.user;

              const dataToSend = {
                data: {
                  user: updatedUser,
                  changeType: dbConfig.ChangeTypes.UPDATE,
                },
              };

              io.emit(dbConfig.EmitTypes.USER, dataToSend);

              callback(dataToSend);
            },
          });
        },
      });
    },
  });
}

/**
 * Remove a user.
 * @param {Object} params - Parameters.
 * @param {string} params.token - jwt.
 * @param {string} params.userId - Id of the user to remove.
 * @param {Function} params.callback - Callback.
 */
function removeUser({
  token,
  userId,
  callback,
}) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.RemoveUser.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const { user } = data;

      getAccessibleUser({
        user,
        userId,
        callback: (userData) => {
          if (userData.error) {
            callback({ error: userData.error });

            return;
          }

          // TODO Remove everything connected to the user. Should EVERYTHING be removed?

          dbUser.removeUser({
            userId,
            callback: ({ error: removeError }) => {
              if (removeError) {
                callback({ error: removeError });

                return;
              }

              const dataToSend = {
                data: {
                  user: { objectId: userId },
                  changeType: dbConfig.ChangeTypes.REMOVE,
                },
              };

              callback(dataToSend);
            },
          });
        },
      });
    },
  });
}

exports.createUser = createUser;
exports.getUserByName = getUserByName;
exports.getUserById = getUserById;
exports.changePassword = changePassword;
exports.login = login;
exports.logout = logout;
exports.banUser = banUser;
exports.unbanUser = unbanUser;
exports.verifyUser = verifyUser;
exports.updateUser = updateUser;
exports.removeUser = removeUser;
exports.getUsersByUser = getUsersByUser;
