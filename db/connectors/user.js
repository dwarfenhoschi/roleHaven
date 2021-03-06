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

const mongoose = require('mongoose');
const dbConnector = require('../databaseConnector');
const errorCreator = require('../../objects/error/errorCreator');
const dbConfig = require('../../config/defaults/config').databasePopulation;
const dbAlias = require('./alias');
const dbTeam = require('./team');


// Access levels: Lowest / Lower / Middle / Higher / Highest / God
// 1 / 3 / 5 / 7 / 9 / 11

const userSchema = new mongoose.Schema(dbConnector.createSchema({
  username: { type: String, unique: true },
  mailAddress: { type: String, unique: true, sparse: true },
  fullName: String,
  password: String,
  socketId: String,
  lastOnline: Date,
  registerDevice: String,
  hasFullAccess: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  isOnline: { type: Boolean, default: false },
  isLootable: { type: Boolean, default: false },
  defaultRoomId: { type: String, default: dbConfig.rooms.public.objectId },
  partOfTeams: { type: [String], default: [] },
  followingRooms: { type: [String], default: [] },
  aliases: { type: [String], default: [] },
}), { collection: 'users' });

const User = mongoose.model('User', userSchema);

/**
 * Remove private parameters
 * @private
 * @param {Object} user - User
 * @param {boolean} [noClean] - Should less parameters be removed before returning object?
 * @returns {Object} Clean user
 */
function modifyUserParameters(user, noClean) {
  const modifiedUser = user;

  modifiedUser.password = typeof modifiedUser.password === 'string';

  if (!noClean) {
    modifiedUser.mailAddress = typeof modifiedUser.mailAddress === 'string';
  }

  return modifiedUser;
}

/**
 * Update user
 * @param {Object} params - Parameters
 * @param {string} params.userId - User ID
 * @param {Object} params.update - Update
 * @param {Function} params.callback Callback
 */
function updateObject({
  userSocketId,
  userId,
  update,
  callback,
}) {
  const query = {};

  if (userId) {
    query._id = userId;
  } else {
    query.socketId = userSocketId;
  }

  dbConnector.updateObject({
    update,
    query,
    object: User,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({ data: { user: modifyUserParameters(data.object) } });
    },
  });
}

/**
 * Update users
 * @param {Object} params - Parameters
 * @param {Object} params.update - Database update
 * @param {Function} params.callback Callback
 * @param {string} [params.query] - Database query
 */
function updateObjects({ query, update, callback }) {
  dbConnector.updateObjects({
    update,
    query,
    object: User,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({
        data: {
          users: data.objects.map(object => modifyUserParameters(object)),
        },
      });
    },
  });
}

/**
 * Get users.
 * @private
 * @param {Object} params - Parameters.
 * @param {Object} [params.filter] - Parameters to be filtered from the db result.
 * @param {Object} params.query - Query to get users.
 * @param {Function} params.callback - Callback.
 */
function getUsers({ filter, query, callback }) {
  dbConnector.getObjects({
    query,
    filter,
    object: User,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({
        data: {
          users: data.objects.map(user => modifyUserParameters(user)),
        },
      });
    },
  });
}

/**
 * Get user
 * @private
 * @param {Object} params - Parameters
 * @param {string} params.query - Query to get alias
 * @param {Function} params.callback - Callback
 */
function getUser({ filter, query, callback }) {
  dbConnector.getObject({
    query,
    filter,
    object: User,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      } else if (!data.object) {
        callback({ error: new errorCreator.DoesNotExist({ name: `user ${query.toString()}` }) });

        return;
      }

      callback({ data: { user: modifyUserParameters(data.object) } });
    },
  });
}

/**
 * Get user by name
 * @param {Object} params - Parameters
 * @param {string} params.username - Name of the user
 * @param {Function} params.callback - Callback
 */
function getUserByName({ username, callback }) {
  getUser({
    callback,
    query: { username },
  });
}

/**
 * Get user by Id.
 * @param {Object} params - Parameters.
 * @param {string} params.userId - Id of the user.
 * @param {Function} params.callback - Callback.
 */
function getUserById({ userId, callback }) {
  getUser({
    callback,
    query: { _id: userId },
  });
}

/**
 * Authorize user. The user can be found by either the username or user Id.
 * @param {Object} params - Parameters.
 * @param {string} params.password - Password of the user.
 * @param {Function} params.callback - Callback.
 * @param {string} [params.userId] - Id of the user.
 * @param {string} [params.username] - Name of the user.
 */
function authUser({
  username,
  userId,
  password,
  callback,
}) {
  const query = {
    password,
    isBanned: false,
    isVerified: true,
  };

  if (userId) {
    query._id = userId;
  } else {
    query.username = username;
  }

  getUser({
    callback,
    query,
  });
}

/**
 * Does the user already exist?
 * @param {Object} params - Parameters
 * @param {string} [params.username] - Username to check
 * @param {string} [params.mailAddress] - Mail address connected to the user
 * @param {Function} params.callback - Callback
 */
function doesUserExist({ username, mailAddress, callback }) {
  const query = { $or: [] };

  if (username) { query.$or.push({ username }); }
  if (mailAddress) { query.$or.push({ mailAddress }); }

  dbConnector.doesObjectExist({
    query: { username },
    object: User,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error: new errorCreator.Database({ errorObject: error }) });

        return;
      } else if (data.exists) {
        callback({ data: { exists: true } });

        return;
      }

      dbAlias.doesAliasExist({
        callback,
        aliasName: username,
      });
    },
  });
}

/**
 * Create and save user
 * @param {Object} params - Parameters
 * @param {Object} params.user - New user
 * @param {Function} params.callback - Callback
 */
function createUser({ user, callback }) {
  doesUserExist({
    name: user.username,
    mailAddress: user.mailAddress,
    callback: (nameData) => {
      if (nameData.error) {
        callback({ error: nameData.error });

        return;
      } else if (nameData.data.exists) {
        callback({ error: new errorCreator.AlreadyExists({ name: `username: ${user.username}` }) });
      }

      const userId = mongoose.Types.ObjectId();
      const userToSave = user;
      userToSave._id = userId;
      userToSave.ownerId = userId.toString();

      dbConnector.saveObject({
        object: new User(userToSave),
        objectType: 'user',
        callback: ({ error, data }) => {
          if (error) {
            callback({ error });

            return;
          }

          callback({ data: { user: modifyUserParameters(data.savedObject) } });
        },
      });
    },
  });
}

/**
 * Set user as being online/offline.
 * @param {Object} params - Paramters.
 * @param {string} params.userId - ID of the user to update.
 * @param {boolean} params.isOnline - Is the user online?
 * @param {Function} params.callback - Callback.
 * @param {string} [params.socketId] - Socket ID of the user.
 */
function updateOnline({
  userId,
  userSocketId,
  isOnline,
  socketId,
  callback,
}) {
  const update = { $set: {}, $unset: {} };

  if (isOnline) {
    update.$set.isOnline = true;

    if (socketId) {
      update.$set.socketId = socketId;
    }
  } else {
    update.$set.isOnline = false;
    update.$unset.socketId = '';
  }

  update.$set.lastOnline = new Date();

  updateObject({
    userId,
    userSocketId,
    update,
    callback,
  });
}

/**
 * Update a user.
 * @param {Object} params - Parameters.
 * @param {Object} params.user - User parameters to update.
 * @param {Function} params.callback - Callback.
 * @param {string} [params.userId] - Id of the user. Will override userSocketId to get and update a device.
 * @param {string} [params.userSocketId] - Socket Id. Will be used to get and update a device. Overriden by userId.
 */
function updateUser({
  userSocketId,
  userId,
  user,
  callback,
  options = {},
}) {
  const {
    mailAddress,
    username,
    fullName,
    visibility,
    accessLevel,
    defaultRoomId,
    isLootable,
    hasFullAccess,
    socketId,
  } = user;
  const {
    resetSocket,
  } = options;
  const update = { $set: {}, $unset: {} };

  if (resetSocket) {
    update.$unset.socketId = '';
  } else if (socketId) {
    update.$set.socketId = socketId;
  }

  if (mailAddress) { update.$set.mailAddress = mailAddress; }
  if (username) { update.$set.username = username; }
  if (fullName) { update.$set.fullName = fullName; }
  if (visibility) { update.$set.visibility = visibility; }
  if (accessLevel) { update.$set.accessLevel = accessLevel; }
  if (defaultRoomId) { update.$set.defaultRoomId = defaultRoomId; }
  if (typeof isLootable === 'boolean') { update.$set.isLootable = isLootable; }
  if (typeof hasFullAccess === 'boolean') { update.$set.hasFullAccess = hasFullAccess; }

  if (username || mailAddress) {
    doesUserExist({
      username,
      mailAddress,
      callback: (existsData) => {
        if (existsData.error) {
          callback({ error: existsData.error });

          return;
        } else if (existsData.data.exists) {
          callback({ error: new errorCreator.AlreadyExists({ name: `user mail ${mailAddress} username ${username}` }) });

          return;
        }

        updateObject({
          update,
          callback,
          userSocketId,
          userId,
        });
      },
    });

    return;
  }

  updateObject({
    update,
    callback,
    userId,
  });
}

/**
 * Verify user
 * @param {Object} params - Parameters
 * @param {string} params.userId - ID of the user
 * @param {Function} params.callback - Callback
 */
function verifyUser({ userId, callback }) {
  updateObject({
    userId,
    callback,
    update: { isVerified: true },
  });
}

/**
 * Ban or unban user
 * @param {Object} params - Parameters
 * @param {string} params.userId - ID of the user
 * @param {boolean} params.shouldBan - Should the user be banned?
 * @param {Function} params.callback - Callback
 */
function updateBanUser({ shouldBan, userId, callback }) {
  const update = {
    $set: { isBanned: shouldBan },
    $unset: { socketId: '' },
  };

  updateObject({
    userId,
    update,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({ data: { user: modifyUserParameters(data.user) } });
    },
  });
}

/**
 * Set new password for user
 * @param {Object} params - Parameters
 * @param {string} params.userId - ID of the user
 * @param {string} params.password - New password
 * @param {Function} params.callback - Callback
 */
function updateUserPassword({ userId, password, callback }) {
  const update = { $set: { password } };

  updateObject({
    userId,
    update,
    callback,
  });
}

/**
 * Get users that the user has access to.
 * @param {Object} params - Parameters.
 * @param {Function} params.callback - Callback.
 * @param {boolean} [params.includeInactive] - Should banned and unverified users be retrieved?
 * @param {boolean} [params.full] - Should access information be retrieved?
 */
function getUsersByUser({
  includeInactive,
  user,
  callback,
  full = false,
}) {
  const query = dbConnector.createUserQuery({ user });

  if (!includeInactive) {
    query.isBanned = false;
    query.isVerified = true;
  }

  getUsers({
    query,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const { users } = data;

      if (!full) {
        dbAlias.getAliasesByUser({
          user,
          full,
          callback: ({ error: aliasError, data: aliasData }) => {
            if (aliasError) {
              callback({ error: aliasError });

              return;
            }

            const { aliases } = aliasData;
            const allUsers = users.concat(aliases).sort((a, b) => {
              const aName = a.username || a.aliasName;
              const bName = b.username || b.aliasName;

              if (aName < bName) {
                return -1;
              } else if (aName > bName) {
                return 1;
              }

              return 0;
            }).map((item) => {
              return {
                username: item.username || item.aliasName,
                objectId: item.objectId,
                lastUpdated: item.lastUpdated,
              };
            });

            callback({
              data: {
                users: allUsers,
              },
            });
          },
        });

        return;
      }

      callback({ data: { users } });
    },
  });
}

// FIXME Should it remove messages, rooms, teams, forums, alias and other connected to the user?
/**
 * Remove user
 * @param {Object} params - Parameters
 * @param {string} params.userId - ID of the user
 * @param {Function} params.callback - Callback
 */
function removeUser({
  userId,
  callback,
}) {
  dbConnector.removeObject({
    callback,
    object: User,
    query: { _id: userId },
  });
}

/**
 * Add a team to the user.
 * @param {Object} params - Parameters.
 * @param {string} params.userId - ID of the user.
 * @param {string} params.teamId - ID of the team.
 * @param {Function} params.callback - Callback.
 * @param {boolean} [params.isAdmin] - Should the user be set as an admin for the team?
 */
function addToTeam({
  userId,
  teamId,
  isAdmin,
  callback,
}) {
  updateObject({
    userId,
    update: { partOfTeams: { $addToSet: teamId } },
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      dbTeam.addAccess({
        teamId,
        userIds: [userId],
        userAdminIds: isAdmin ? [userId] : undefined,
        callback: ({ error: teamError, data: teamData }) => {
          if (teamError) {
            callback({ error: teamError });

            return;
          }

          callback({
            data: {
              team: teamData.team,
              user: data.user,
            },
          });
        },
      });
    },
  });
}

/**
 * Add alias to user.
 * @param {Object} params - Parameters.
 * @param {string} params.aliasId - Id of the alias.
 * @param {string} params.userId - Id of the user.
 * @param {Function} params.callback - Callback
 */
function addAlias({
  aliasId,
  userId,
  callback,
}) {
  updateObject({
    userId,
    update: { aliases: { $addToSet: aliasId } },
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({ data });
    },
  });
}

/**
 * Remove alias from user.
 * @param {Object} params - Parameters.
 * @param {string} params.aliasId - Id of the alias.
 * @param {string} params.userId - Id of the user.
 * @param {Function} params.callback - Callback
 */
function removeAlias({
  aliasId,
  userId,
  callback,
}) {
  updateObject({
    userId,
    callback,
    update: { aliases: { $pull: aliasId } },
  });
}

/**
 * Remove alias from all users.
 * @param {Object} params - Parameters.
 * @param {string} params.aliasId - Id of the alias.
 * @param {Function} params.callback - Callback
 */
function removeAliasFromAllUsers({
  aliasId,
  callback,
}) {
  updateObjects({
    callback,
    update: { aliases: { $pull: aliasId } },
  });
}

/**
 * Remove a team from the user
 * @param {Object} params - Parameters
 * @param {string} params.userId - ID of the user
 * @param {string} params.teamId - ID of the team
 * @param {Function} params.callback - Callback
 */
function removeFromTeam({ userId, teamId, callback }) {
  updateObject({
    userId,
    update: { partOfTeams: { $pull: teamId } },
    callback: ({ error }) => {
      if (error) {
        callback({ error });

        return;
      }

      dbTeam.removeAccess({
        teamId,
        callback,
        userIds: [userId],
        userAdminIds: [userId],
      });
    },
  });
}

// TODO Redis would be a good choice to store user id and socket id connection
/**
 * Get all socket ids from users
 * @param {Object} params - Parameters
 * @param {Function} params.callback - Callback
 */
function getAllSocketIds({ callback }) {
  getUsers({
    query: { socketId: { $exists: true } },
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      const userSocketIds = {};

      data.users.forEach((user) => {
        userSocketIds[user.objectId] = user.socketId;
      });

      callback({ data: { userSocketIds } });
    },
  });
}

/**
 * Remove room from all users.
 * @param {Object} params - Parameters
 * @param {string} params.roomId - ID of the room
 * @param {Function} params.callback - Callback
 */
function removeRoomFromAll({ roomId, callback }) {
  updateObjects({
    callback,
    update: { $pull: { followingRooms: roomId } },
  });
}

/**
 * Remove team from all users.
 * @param {Object} params - Parameters.
 * @param {string} params.teamId - ID of the team.
 * @param {Function} params.callback - Callback.
 */
function removeTeamFromAll({ teamId, callback }) {
  updateObjects({
    callback,
    update: { $pull: { partOfTeams: teamId } },
  });
}

/**
 * Get banned and unverified users.
 * @param {Object} params - Parameters.
 * @param {Function} params.callback - Callback.
 */
function getInactiveUsers({ callback }) {
  const query = {
    $or: [
      { isBanned: true },
      { isVerified: false },
    ],
  };

  getUsers({
    query,
    callback,
    filter: {
      fullName: 1,
      username: 1,
      lastUpdated: 1,
      isBanned: 1,
      isVerified: 1,
    },
  });
}

/**
 * Add a room to a user.
 * @param {Object} params - Parameters.
 * @param {string} params.roomId - Id of the room to add.
 * @param {string} params.userId - Id of the user to update.
 * @param {Function} params.callback - Callback
 */
function followRoom({
  roomId,
  userId,
  callback,
}) {
  updateObject({
    userId,
    update: {
      followingRooms: { $addToSet: roomId },
    },
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({ data });
    },
  });
}

/**
 * Remove a room from a user.
 * @param {Object} params - Parameters.
 * @param {string} params.roomId - Id of the room to remove.
 * @param {string} params.userId - Id of the user to update.
 * @param {Function} params.callback - Callback
 */
function unfollowRoom({
  roomId,
  userId,
  callback,
}) {
  updateObject({
    userId,
    update: {
      followingRooms: { $pull: roomId },
    },
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({ data });
    },
  });
}

/**
 * Get all names from the users.
 * @param {Object} params - Parameters.
 * @param {Function} params.callback - Callback
 */
function getAllUserNames({ callback }) {
  getUsers({
    callback,
    filter: {
      username: 1,
      fullName: 1,
    },
  });
}

exports.getUserByName = getUserByName;
exports.authUser = authUser;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.verifyUser = verifyUser;
exports.updateBanUser = updateBanUser;
exports.updateUserPassword = updateUserPassword;
exports.getUserById = getUserById;
exports.removeUser = removeUser;
exports.doesUserExist = doesUserExist;
exports.getAllSocketIds = getAllSocketIds;
exports.addToTeam = addToTeam;
exports.removeFromTeam = removeFromTeam;
exports.removeRoomFromAll = removeRoomFromAll;
exports.removeTeamFromAll = removeTeamFromAll;
exports.updateOnline = updateOnline;
exports.getInactiveUsers = getInactiveUsers;
exports.followRoom = followRoom;
exports.unfollowRoom = unfollowRoom;
exports.getUsersByUser = getUsersByUser;
exports.addAlias = addAlias;
exports.removeAlias = removeAlias;
exports.removeAliasFromAllUsers = removeAliasFromAllUsers;
exports.getAllUserNames = getAllUserNames;
