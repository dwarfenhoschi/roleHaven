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

const mongoose = require('mongoose');
const errorCreator = require('../../objects/error/errorCreator');
const dbConnector = require('../databaseConnector');
const dbForumThread = require('./forumThread');

const forumSchema = new mongoose.Schema(dbConnector.createSchema({
  title: { type: String, unique: true },
  text: { type: [String], default: [] },
  isPersonal: { type: Boolean, default: false },
}), { collection: 'forums' });

const Forum = mongoose.model('Forum', forumSchema);

const forumFilter = dbConnector.createFilter({
  title: 1,
  threadIds: 1,
  text: 1,
});

/**
 * Update forum object fields.
 * @private
 * @param {Object} params - Parameters.
 * @param {string} params.forumId - Id of forum to update.
 * @param {Object} params.update - Update.
 * @param {Function} params.callback Callback.
 */
function updateObject({
  forumId,
  update,
  callback,
}) {
  dbConnector.updateObject({
    update,
    object: Forum,
    query: { _id: forumId },
    errorNameContent: 'updateForum',
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({ data: { forum: data.object } });
    },
  });
}

/**
 * Get forums
 * @private
 * @param {Object} params - Parameters
 * @param {Object} params.query - Query to get forums
 * @param {Function} params.callback - Callback
 */
function getForums({
  query,
  filter,
  callback,
}) {
  dbConnector.getObjects({
    query,
    filter,
    object: Forum,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({
        data: {
          forums: data.objects,
        },
      });
    },
  });
}

/**
 * Get forum object
 * @private
 * @param {Object} params - Parameters
 * @param {string} params.query - Query to get forum object
 * @param {Function} params.callback - Callback
 */
function getForum({ query, callback }) {
  dbConnector.getObject({
    query,
    object: Forum,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      } else if (!data.object) {
        callback({ error: new errorCreator.DoesNotExist({ name: `forum ${JSON.stringify(query, null, 4)}` }) });

        return;
      }

      callback({ data: { forum: data.object } });
    },
  });
}

/**
 * Does forum exist?
 * @param {Object} params - Parameters
 * @param {string} params.title - Title of the forum
 * @param {Function} params.callback - Callback
 */
function doesForumExist({ title, callback }) {
  dbConnector.doesObjectExist({
    callback,
    query: { title },
    object: Forum,
  });
}

/**
 * Create a forum.
 * @param {Object} params - Parameters.
 * @param {Object} params.forum - Forum to save.
 * @param {Function} params.callback - Callback.
 * @param {Object} [params.options] - Creation options.
 */
function createForum({
  forum,
  callback,
  options = {},
}) {
  const { setId } = options;

  doesForumExist({
    title: forum.title,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      } else if (data.exists) {
        callback({ error: new errorCreator.AlreadyExists({ name: `createForum ${forum.title}` }) });

        return;
      }

      const forumToSave = forum;

      if (setId) {
        forumToSave._id = forumToSave.objectId; // eslint-disable-line no-underscore-dangle
      }

      dbConnector.saveObject({
        object: new Forum(forum),
        objectType: 'forum',
        callback: (forumData) => {
          if (forumData.error) {
            callback({ error: forumData.error });

            return;
          }

          callback({ data: { forum: forumData.data.savedObject } });
        },
      });
    },
  });
}

/**
 * Get forum by Id
 * @param {Object} params - Parameters
 * @param {string} params.forumId - ID of the forum
 * @param {Function} params.callback - Callback
 */
function getForumById({ forumId, callback }) {
  getForum({
    callback,
    query: { _id: forumId },
  });
}

/**
 * Get forums by Id
 * @param {Object} params - Parameters
 * @param {string[]} params.forumIds - ID of the forum
 * @param {Function} params.callback - Callback
 */
function getForumsByIds({ forumIds, callback }) {
  getForums({
    callback,
    query: { _id: { $in: forumIds } },
  });
}

/**
 * Get all forums
 * @param {Object} params - Parameters
 * @param {Function} params.callback - Callback
 */
function getAllForums({ callback }) {
  getForums({ callback });
}

/**
 * Update existing forum
 * @param {Object} params - Parameters
 * @param {string} params.forumId - ID of the forum
 * @param {Object} params.forum - Forum updates
 * @param {Function} params.callback - Callback
 */
function updateForum({ forumId, forum, callback }) {
  const update = { $set: {} };

  if (forum.title) {
    update.$set.title = forum.title;

    doesForumExist({
      title: forum.title,
      callback: ({ error, data }) => {
        if (error) {
          callback({ error });

          return;
        } else if (data.exists) {
          callback({ error: new errorCreator.AlreadyExists({ name: `forum title ${forum.title}` }) });

          return;
        }

        updateObject({
          update,
          forumId,
          callback,
        });
      },
    });

    return;
  }

  updateObject({
    update,
    forumId,
    callback,
  });
}

/**
 * Remove forum.
 * Setting fullRemoval will also remove all connected forum threads and posts.
 * @param {Object} params - Parameters
 * @param {string[]} params.forumId - ID of forum to remove
 * @param {boolean} params.fullRemoval - Should connected forum threads and posts be removed?
 * @param {Function} params.callback - Callback
 */
function removeForum({ forumId, fullRemoval, callback }) {
  dbConnector.removeObjects({
    object: Forum,
    query: { _id: forumId },
    callback: ({ error }) => {
      if (error) {
        callback({ error: new errorCreator.Database({ errorObject: error, name: 'removeForum' }) });

        return;
      }

      if (fullRemoval) {
        dbForumThread.getThreadsByForum({
          forumId,
          callback: (threadsData) => {
            if (threadsData.error) {
              callback({ error: threadsData.error });

              return;
            }

            dbForumThread.removeThreads({
              callback,
              threadIds: threadsData.data.threads.map(forumThread => forumThread.objectId),
              fullRemoval: true,
            });
          },
        });

        return;
      }

      callback({ data: { success: true } });
    },
  });
}

/**
 * Add access to forum
 * @param {Object} params - Parameters
 * @param {string} params.forumId - ID of the team
 * @param {string[]} [params.userIds] - ID of the users
 * @param {string[]} [params.teamIds] - ID of the teams
 * @param {string[]} [params.bannedIds] - Blocked ids
 * @param {string[]} [params.teamAdminIds] - Id of the teams to give admin access to. They will also be added to teamIds.
 * @param {string[]} [params.userAdminIds] - Id of the users to give admin access to. They will also be added to userIds.
 * @param {Function} params.callback - Callback
 */
function addAccess({
  forumId,
  userIds,
  teamIds,
  bannedIds,
  teamAdminIds,
  userAdminIds,
  callback,
}) {
  dbConnector.addObjectAccess({
    userIds,
    teamIds,
    bannedIds,
    teamAdminIds,
    userAdminIds,
    objectId: forumId,
    object: Forum,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({ data: { forum: data.object } });
    },
  });
}

/**
 * Remove access to forum
 * @param {Object} params - Parameters
 * @param {string} params.forumId - ID of the team
 * @param {string[]} params.teamIds - ID of the teams
 * @param {string[]} [params.userIds] - ID of the user
 * @param {string[]} [params.bannedIds] - Blocked ids
 * @param {string[]} [params.teamAdminIds] - Id of the teams to remove admin access from. They will not be removed from teamIds.
 * @param {string[]} [params.userAdminIds] - Id of the users to remove admin access from. They will not be removed from userIds.
 * @param {Function} params.callback - Callback
 */
function removeAccess({
  forumId,
  userIds,
  teamIds,
  bannedIds,
  teamAdminIds,
  userAdminIds,
  callback,
}) {
  dbConnector.removeObjectAccess({
    userIds,
    teamIds,
    bannedIds,
    teamAdminIds,
    userAdminIds,
    objectId: forumId,
    object: Forum,
    callback: ({ error, data }) => {
      if (error) {
        callback({ error });

        return;
      }

      callback({ data: { forum: data.object } });
    },
  });
}

/**
 * Get forums by user.
 * @param {Object} params - Parameters.
 * @param {Object} params.user - User retrieving the forums.
 * @param {Function} params.callback - Callback.
 */
function getForumsByUser({
  user,
  full,
  callback,
}) {
  const query = dbConnector.createUserQuery({ user });
  const filter = !full ? forumFilter : {};

  getForums({
    filter,
    query,
    callback,
  });
}

exports.createForum = createForum;
exports.getForumById = getForumById;
exports.getForumById = getForumById;
exports.updateForum = updateForum;
exports.getAllForums = getAllForums;
exports.getForumsByIds = getForumsByIds;
exports.removeForum = removeForum;
exports.addAccess = addAccess;
exports.removeAccess = removeAccess;
exports.getForumsByUser = getForumsByUser;
