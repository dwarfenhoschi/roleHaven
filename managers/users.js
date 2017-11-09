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
const dbInvitation = require('../db/connectors/invitation');
const mailer = require('../helpers/mailer');
const textTools = require('../utils/textTools');
const objectValidator = require('../utils/objectValidator');
const authenticator = require('../helpers/authenticator');
const roomManager = require('./rooms');
const dbMailEvent = require('../db/connectors/mailEvent');
const deviceManager = require('../managers/devices');

/**
 * Create a user and all other objects needed for it
 * @param {Object} params.user - User to create
 * @param {string} params.origin - Name of the caller origin. Allowed: "socket"
 * @param {Function} params.callback - Callback
 */
function createUser({ token, user, callback, origin = '' }) {
  authenticator.isUserAllowed({
    token,
    commandName: origin === 'socket' && !appConfig.disallowSocketUserRegister ? dbConfig.apiCommands.CreateUserThroughSocket.name : dbConfig.apiCommands.CreateUser.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      } else if (!objectValidator.isValidData({ user }, { user: { username: true, registerDevice: true, password: true } })) {
        callback({ error: new errorCreator.InvalidData({ expected: '{ user: { username, registerDevice, password } }' }) });

        return;
      } else if (!textTools.isAllowedFull(user.username.toLowerCase())) {
        callback({ error: new errorCreator.InvalidCharacters({ name: `User name: ${user.username}` }) });

        return;
      } else if (user.username.length > appConfig.usernameMaxLength || user.password.length > appConfig.passwordMaxLength || user.registerDevice.length > appConfig.deviceIdLength) {
        callback({ error: new errorCreator.InvalidCharacters({ name: `User name length: ${appConfig.usernameMaxLength} Password length: ${appConfig.usernameMaxLength} Device length: ${appConfig.deviceIdLength}` }) });

        return;
      } else if ((user.visibility || user.accessLevel || user.verified) && dbConfig.apiCommands.ChangeUserLevels.accessLevel > data.user.accessLevel) {
        callback({ error: new errorCreator.NotAllowed({ name: 'set access or visibility level' }) });

        return;
      } else if (dbConfig.protectedNames.indexOf(user.username.toLowerCase()) > -1) {
        callback({ error: new errorCreator.InvalidCharacters({ name: `protected name ${user.username}` }) });

        return;
      } else if (appConfig.userVerify && (!user.mail || !textTools.isValidMail(user.mail))) {
        callback({ error: new errorCreator.InvalidMail({}) });

        return;
      }

      const createUserFunc = () => {
        const { username, fullName, password, registerDevice, banned, accessLevel, visibility } = user;
        const lowerCaseUsername = username.toLowerCase();
        const mail = appConfig.userVerify ? user.mail.toLowerCase() : Date.now();
        const verified = appConfig.userVerify ? user.verified : true;

        const newUser = {
          password,
          registerDevice,
          mail,
          banned,
          verified,
          accessLevel,
          visibility,
          username: lowerCaseUsername,
          registeredAt: new Date(),
          fullName: fullName || lowerCaseUsername,
          rooms: [
            dbConfig.rooms.public.roomName,
            dbConfig.rooms.bcast.roomName,
            dbConfig.rooms.important.roomName,
            dbConfig.rooms.user.roomName,
            dbConfig.rooms.news.roomName,
            dbConfig.rooms.schedule.roomName,
          ],
        };

        dbUser.createUser({
          user: newUser,
          callback: (userData) => {
            if (userData.error) {
              callback({ error: userData.error });

              return;
            }

            const createdUser = userData.data.user;

            roomManager.createSpecialRoom({
              room: {
                owner: createdUser.username,
                roomName: createdUser.username + appConfig.whisperAppend,
                visibility: dbConfig.AccessLevels.SUPERUSER,
                accessLevel: dbConfig.AccessLevels.SUPERUSER,
                isWhisper: true,
              },
              user: createdUser,
              callback: ({ error: roomError }) => {
                if (roomError) {
                  callback({ error: roomError });

                  return;
                }

                const wallet = {
                  walletId: createdUser.userId,
                  accessLevel: createdUser.accessLevel,
                  owner: createdUser.username,
                  amount: appConfig.defaultWalletAmount,
                };

                dbWallet.createWallet({
                  wallet,
                  callback: ({ error: walletError, data: walletData }) => {
                    if (walletError) {
                      callback({ error: walletError });

                      return;
                    }

                    dbInvitation.createInvitationList({
                      username: createdUser.username,
                      callback: ({ error: listError }) => {
                        if (listError) {
                          callback({ error: listError });

                          return;
                        }

                        mailer.sendVerification({
                          address: createdUser.mail,
                          username: createdUser.username,
                          callback: ({ error: mailError }) => {
                            if (mailError) {
                              callback({ error: mailError });

                              return;
                            }

                            callback({
                              data: {
                                user: createdUser,
                                wallet: walletData.wallet,
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
          },
        });
      };

      dbMailEvent.isBlockedMail({
        address: user.mail.toLowerCase(),
        callback: ({ error: mailError, data: mailData }) => {
          if (mailError) {
            callback({ mailError });

            return;
          } else if (mailData.isBlocked) {
            callback({ error: new errorCreator.InvalidMail({}) });

            return;
          }

          createUserFunc();
        },
      });
    },
  });
}

/**
 * List users
 * @param {boolean} params.includeInactive Should banned and verified users be retrieved?
 * @param {Object} params.token jwt
 * @param {Function} params.callback Callback
 * @param {Object} [params.team] Team
 * @param {string} params.team.teamName Team name that will be checked against users
 * @param {boolean} params.team.shouldEqual Should the team name sent be the same as retrieved users?
 */
function listUsers({ includeInactive, token, callback, team = {} }) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.GetUsers.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const user = data.user;

      dbUser.getUsers({
        user,
        includeInactive: includeInactive && user.accessLevel >= dbConfig.apiCommands.GetInactiveUsers.accessLevel,
        noClean: user.accessLevel >= dbConfig.apiCommands.GetUserDetails.accessLevel,
        callback: (usersData) => {
          if (usersData.error) {
            callback({ error: usersData.error });

            return;
          }

          const users = usersData.data.users;
          // Should the team name on the retrived user be checked against the sent team name?
          const { teamName, shouldEqual } = team;
          const usersToSend = [];

          users.filter((currentUser) => {
            if (teamName) {
              if (shouldEqual && currentUser.team && currentUser.team === user.team) {
                return true;
              } else if (!shouldEqual && ((!currentUser.team && user.team) || currentUser.team !== user.team)) {
                return true;
              }

              return false;
            }

            return true;
          }).forEach((currentUser) => {
            if (includeInactive || (currentUser.verified && !currentUser.banned)) {
              const aliases = currentUser.aliases.map((alias) => {
                return { username: alias };
              });
              const filteredUser = {
                username: currentUser.username,
                online: currentUser.online,
                team: currentUser.team,
              };

              if (user.accessLevel >= dbConfig.apiCommands.GetUserDetails.accessLevel) {
                filteredUser.mail = currentUser.mail;
                filteredUser.verified = currentUser.verified;
                filteredUser.banned = currentUser.banned;
                filteredUser.fullName = currentUser.fullName;
                filteredUser.warnings = currentUser.warnings;
                filteredUser.aliases = currentUser.aliases;
              }

              usersToSend.push(filteredUser);

              if (!teamName && aliases && aliases.length > 0) {
                Array.prototype.push.apply(filteredUser, aliases);
              }
            }
          });

          callback({
            data: {
              users: usersToSend,
            },
          });
        },
      });
    },
  });
}

/**
 * Change password
 * @param {string} params.key Password request key
 * @param {string} params.password Password
 * @param {Function} params.callback Callback
 */
function changePassword({ key, password, callback }) {
  if (!objectValidator.isValidData({ key, password }, { key: true, password: true })) {
    callback({ error: new errorCreator.InvalidData({ expected: '{ key, password }' }) });

    return;
  }

  dbMailEvent.getMailEventByKey({
    key,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      dbUser.updateUserPassword({
        password,
        username: data.event.owner,
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

/**
 * Send password reset mail
 * @param {string} params.mail Mail address to send password recovery to
 * @param {Function} params.callback Callback
 */
function sendPasswordReset({ mail, callback }) {
  if (!textTools.isValidMail(mail)) {
    callback({ error: new errorCreator.InvalidMail({}) });

    return;
  }

  dbUser.getUserByMail({
    mail,
    callback: ({ error: userError, data: userData }) => {
      if (userError) {
        callback({ error: userError });

        return;
      }

      mailer.sendPasswordReset({
        address: userData.user.mail,
        username: userData.user.username,
        callback: ({ error: resetError }) => {
          if (resetError) {
            callback({ error: resetError });

            return;
          }

          callback({ data: { success: true } });
        },
      });
    },
  });
}

/**
 * Get user by name
 * @param {string} params.username User to retrieve
 * @param {Object} params.user User retrieving the user
 * @param {Function} params.callback Callback
 */
function getUser({ token, username, callback }) {
  authenticator.isUserAllowed({
    token,
    matchToId: username,
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

      dbUser.getUser({
        username: username.toLowerCase(),
        callback: ({ error: userError, data: userData }) => {
          if (userError) {
            callback({ error: userError });

            return;
          } else if (userData.user.accessLevel > data.user.accessLevel) {
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
 * Login user through socket client side
 * @param {Object} params.user User logging in
 * @param {Object} params.device Device logged in on
 * @param {Object} params.socket Socket io
 * @param {Object} params.io Socket io
 * @param {Function} params.callback Callback
 */
function login({ user, device, socket, io, callback }) {
  if (!objectValidator.isValidData({ user, device }, { user: { username: true, password: true }, device: { deviceId: true } })) {
    callback({ error: new errorCreator.InvalidData({ expected: '{ user: { username, password } }' }) });

    return;
  }

  const username = user.username.toLowerCase();

  dbUser.getUser({
    username,
    includeInactive: true,
    callback: ({ error: userError, data: userData }) => {
      if (userError) {
        callback({ error: userError });

        return;
      } else if (userData.user.banned) {
        callback({ error: new errorCreator.Banned({}) });

        return;
      } else if (!userData.user.verified) {
        callback({ error: new errorCreator.NeedsVerification({}) });

        return;
      }

      const authUser = userData.user;

      authenticator.createToken({
        username: authUser.username,
        password: user.password,
        callback: ({ error, data: tokenData }) => {
          if (error) {
            callback({ error });

            return;
          }

          dbUser.updateUserSocketId({
            username: authUser.username,
            socketId: socket.id,
            callback: (socketData) => {
              if (socketData.error) {
                callback({ error: socketData.error });

                return;
              }

              const newDevice = device;
              newDevice.lastUser = authUser.username;
              newDevice.socketId = socket.id;

              deviceManager.updateDevice({
                device: newDevice,
                callback: ({ error: deviceError }) => {
                  if (deviceError) {
                    callback({ error: deviceError });

                    return;
                  }

                  const oldSocket = io.sockets.connected[authUser.socketId];

                  if (oldSocket) {
                    roomManager.leaveSocketRooms({ socket });
                    oldSocket.emit('logout');
                  }

                  roomManager.joinRooms({ rooms: authUser.rooms, socket });

                  dbUser.setUserLastOnline({
                    username: authUser.username,
                    date: new Date(),
                    callback: ({ error: onlineError }) => {
                      if (onlineError) {
                        callback({ error: onlineError });

                        return;
                      }

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
    },
  });
}

/**
 * Logout user from socket client
 * @param {Object} params.device Device that is logging out
 * @param {string} params.token jwt
 * @param {Object} params.socket Socket io
 * @param {Function} params.callback Callback
 */
function logout({ device, token, socket, callback }) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.Logout.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      } else if (!objectValidator.isValidData({ device }, { device: { deviceId: true } })) {
        callback({ error: new errorCreator.InvalidData({ expected: '{ device: { deviceId } }' }) });

        return;
      }

      const user = data.user;

      dbUser.updateUserSocketId({
        username: user.username,
        callback: ({ error: socketError }) => {
          if (socketError) {
            callback({ error: socketError });

            return;
          }

          const deviceToUpdate = device;
          deviceToUpdate.lastUser = user.username;
          deviceToUpdate.socketId = '';

          deviceManager.updateDevice({
            device: deviceToUpdate,
            callback: ({ error: deviceError }) => {
              if (deviceError) {
                callback({ error: deviceError });

                return;
              }

              dbUser.updateUserOnline({
                username: user.username,
                online: false,
                callback: (onlineData) => {
                  if (onlineData.error) {
                    callback({ error: onlineData.error });

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
    },
  });
}

/**
 * Get banned user names
 * @param {string} params.token jwt
 * @param {Function} params.callback Callback
 */
function getBannedUsers({ token, callback }) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.GetInactiveUsers.name,
    callback: ({ error }) => {
      if (error) {
        callback({ error });

        return;
      }

      dbUser.getBannedUsers({
        callback: (usersData) => {
          if (usersData.error) {
            callback({ error: usersData.error });

            return;
          }

          const { users } = usersData.data;

          callback({
            data: { users: users.map(user => user.username) },
          });
        },
      });
    },
  });
}

/**
 * Match partial user name
 * @param {string} param.partialName Partial user name to match against
 * @param {string} params.token jwt
 * @param {Function} params.callback Callback
 */
function matchPartialUsername({ partialName, token, callback }) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.GetUser.name,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      dbUser.matchPartialUser({
        partialName,
        user: data.user,
        callback: (usersData) => {
          if (usersData.error) {
            callback({ error: usersData.error });

            return;
          }

          const { users } = usersData.data;

          callback({ matches: Object.keys(users).map(userKey => users[userKey].username) });
        },
      });
    },
  });
}

/**
 * Unban user
 * @param {string} params.token jwt token
 * @param {Object} params.user User to unban
 * @param {Function} params.callback Callback
 */
function unbanUser({ token, user, callback }) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.BanUser.name,
    callback: ({ error }) => {
      if (error) {
        callback({ error });

        return;
      } else if (!objectValidator.isValidData({ user }, { user: { username: true } })) {
        callback({ error: new errorCreator.InvalidData({ expected: '{ user: { username } }' }) });

        return;
      }

      dbUser.unbanUser({
        username: user.username.toLowerCase(),
        callback: ({ error: unbanError }) => {
          if (unbanError) {
            callback({ error: unbanError });

            return;
          }

          callback({ data: { success: true } });
        },
      });
    },
  });
}

/**
 * Ban user
 * @param {Object} params.user User to ban
 * @param {Object} params.io socket io
 * @param {string} params.token jwt
 * @param {Function} params.callback Callback
 */
function banUser({ user, io, token, callback }) {
  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.BanUser.name,
    callback: ({ error }) => {
      if (error) {
        callback({ error });

        return;
      } else if (!objectValidator.isValidData({ user }, { user: { username: true } })) {
        callback({ error: new errorCreator.InvalidData({ expected: '{ user: { username } }' }) });

        return;
      }

      const username = user.username.toLowerCase();

      dbUser.updateUserSocketId({
        username,
        callback: ({ error: updateError }) => {
          if (updateError) {
            callback({ error: updateError });

            return;
          }

          dbUser.banUser({
            username,
            noClean: true,
            callback: ({ error: banError, data: banData }) => {
              if (banError) {
                callback({ error: banError });

                return;
              }

              const bannedSocket = io.sockets.connected[banData.user.socketId];

              if (bannedSocket) {
                roomManager.leaveSocketRooms({ socket: bannedSocket });
              }

              io.to(username + appConfig.whisperAppend).emit('ban');

              callback({ data: { success: true } });
            },
          });
        },
      });
    },
  });
}

/**
 * Verify user
 * @param {Object} params.callback Callback
 * @param {Object} params.socket Socket.io
 * @param {string} params.username Name of user to verify
 * @param {Object} params.io Socket io. Will be used if socket is not set
 * @param {string} params.token jwt token
 */
function verifyUserWithoutMail({ username, callback, io, token }) {
  if (!objectValidator.isValidData({ username }, { username: true })) {
    callback({ error: new errorCreator.InvalidData({ expected: '{ username }' }) });

    return;
  }

  authenticator.isUserAllowed({
    commandName: dbConfig.apiCommands.VerifyUser.name,
    token,
    callback: ({ error: authError }) => {
      if (authError) {
        callback({ error: authError });

        return;
      }

      dbMailEvent.getMailEvent({
        owner: username,
        eventType: 'userVerify',
        callback: ({ error: eventError, data: eventData }) => {
          if (eventError) {
            callback({ error: eventError });

            return;
          }

          const event = eventData.event;

          dbUser.verifyUser({
            username,
            callback: (verifyData) => {
              if (verifyData.error) {
                callback({ error: verifyData.error });

                return;
              }

              const user = verifyData.data.user;

              dbMailEvent.removeMailEventByKey({ key: event.key, callback: () => {} });

              callback({ data: { username: user.username } });
              io.emit('user', { data: { user: { username: user.username } } });
            },
          });
        },
      });
    },
  });
}

/**
 * Verify user
 * @param {string} params.key Verification key
 * @param {Object} params.callback Callback
 * @param {Object} params.socket Socket.io
 * @param {Object} params.io Socket io. Will be used if socket is not set
 */
function verifyUser({ key, callback, socket, io }) {
  if (!objectValidator.isValidData({ key }, { key: true })) {
    callback({ error: new errorCreator.InvalidData({ expected: '{ key }' }) });

    return;
  }

  dbMailEvent.getMailEventByKey({
    key,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      dbUser.verifyUser({
        username: data.event.owner,
        callback: (verifyData) => {
          if (verifyData.error) {
            callback({ error: verifyData.error });

            return;
          }

          const user = verifyData.data.user;

          dbMailEvent.removeMailEventByKey({ key, callback: () => {} });
          callback({ data: { username: user.username } });

          if (socket) {
            socket.broadcast.emit('user', { data: { user: { username: user.username } } });
          } else {
            io.emit('user', { data: { user: { username: user.username } } });
          }
        },
      });
    },
  });
}

/**
 * Sends mail with verification link to mail address
 * @param {string} params.mail Mail address
 * @param {Function} params.callback Callback
 */
function sendVerification({ mail, callback }) {
  if (!objectValidator.isValidData({ mail }, { mail: true })) {
    callback({ error: new errorCreator.InvalidData({ expected: '{ mail }' }) });

    return;
  } else if (!textTools.isValidMail(mail)) {
    callback({ error: new errorCreator.InvalidMail({}) });

    return;
  }

  dbUser.getUserByMail({
    mail,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const { user } = data;

      mailer.sendVerification({
        address: mail,
        username: user.username,
        callback: (verificationData) => {
          if (verificationData.error) {
            callback({ error: verificationData.error });

            return;
          }

          callback({ data: { success: true } });
        },
      });
    },
  });
}

/**
 * Sends mail with verification link to mail address
 * @param {string} params.mail Mail address
 * @param {Function} params.callback Callback
 */
function sendAllVerificationMails({ mail, callback }) {
  if (!objectValidator.isValidData({ mail }, { mail: true })) {
    callback({ error: new errorCreator.InvalidData({ expected: '{ mail }' }) });

    return;
  } else if (!textTools.isValidMail(mail)) {
    callback({ error: new errorCreator.InvalidMail({}) });

    return;
  }

  dbUser.getUnverifiedUsers({
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const users = data.users;

      users.forEach((user) => {
        if (textTools.isValidMail(user.mail)) {
          mailer.sendVerification({
            address: user.mail,
            username: user.username,
            callback: (verificationData) => {
              if (verificationData.error) {
                callback({ error: verificationData.error });

                return;
              }

              callback({ data: { success: true } });
            },
          });
        }
      });
    },
  });
}

/**
 * Add blocked addresses and mail domains
 * @param {string} params.token jwt token
 * @param {string[]} [params.mailDomains] Mail domains
 * @param {string[]} [params.addresses] Mail addresses
 * @param {Function} params.callback Callback
 */
function addBlockedMail({ token, mailDomains, addresses, callback }) {
  if (!mailDomains && !addresses) {
    callback({ error: new errorCreator.InvalidData({ expected: 'mailDomains or addresses' }) });

    return;
  }

  authenticator.isUserAllowed({
    token,
    commandName: dbConfig.apiCommands.AddBlockedMail.name,
    callback: ({ error }) => {
      if (error) {
        callback({ error });

        return;
      }

      dbMailEvent.addBlockedMail({
        mailDomains,
        addresses,
        callback: ({ error: blockedError }) => {
          if (blockedError) {
            callback({ error: blockedError });

            return;
          }

          callback({ data: { success: true } });
        },
      });
    },
  });
}

exports.sendVerification = sendVerification;
exports.createUser = createUser;
exports.sendPasswordReset = sendPasswordReset;
exports.getUser = getUser;
exports.changePassword = changePassword;
exports.login = login;
exports.logout = logout;
exports.getBannedUsers = getBannedUsers;
exports.matchPartialUsername = matchPartialUsername;
exports.listUsers = listUsers;
exports.banUser = banUser;
exports.verifyUser = verifyUser;
exports.sendAllVerificationMails = sendAllVerificationMails;
exports.addBlockedMail = addBlockedMail;
exports.unbanUser = unbanUser;
exports.verifyUserWithoutMail = verifyUserWithoutMail;
