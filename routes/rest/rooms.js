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

const express = require('express');
const dbRoom = require('../../db/connectors/room');
const dbConfig = require('../../config/defaults/config').databasePopulation;
const manager = require('../../socketHelpers/manager');
const objectValidator = require('../../utils/objectValidator');
const errorCreator = require('../../objects/error/errorCreator');
const dbUser = require('../../db/connectors/user');
const authenticator = require('../../socketHelpers/authenticator');

const router = new express.Router();

/**
 * @param {object} io - Socket.IO
 * @returns {Object} Router
 */
function handle(io) {
  /**
   * @api {get} /rooms Retrieve all rooms
   * @apiVersion 6.0.0
   * @apiName GetRooms
   * @apiGroup Rooms
   *
   * @apiHeader {String} Authorization Your JSON Web Token
   *
   * @apiDescription Retrieve all rooms available to your user
   *
   * @apiSuccess {Object} data
   * @apiSuccess {Object} data.rooms Found rooms
   * @apiSuccessExample {json} Success-Response:
   *   {
   *    "data": {
   *      "rooms": [
   *        "public",
   *        "bb1"
   *      ]
   *    }
   *  }
   */
  router.get('/', (req, res) => {
    authenticator.isUserAllowed({
      commandName: dbConfig.apiCommands.GetRoom.name,
      token: req.headers.authorization,
      callback: ({ error, data }) => {
        if (error) {
          if (error.type === errorCreator.ErrorTypes.DOESNOTEXIST) {
            res.status(404).json({
              error: {
                status: 404,
                title: 'Command does not exist',
                detail: 'Command does not exist',
              },
            });

            return;
          } else if (error.type === errorCreator.ErrorTypes.NOTALLOWED) {
            res.status(401).json({
              error: {
                status: 401,
                title: 'Unauthorized',
                detail: 'Invalid token',
              },
            });

            return;
          }

          res.status(500).json({
            error: {
              status: 500,
              title: 'Internal Server Error',
              detail: 'Internal Server Error',
            },
          });

          return;
        }

        dbRoom.getAllRooms({
          user: data.user,
          callback: ({ error: roomError, data: roomData }) => {
            if (roomError) {
              res.status(500).json({
                error: {
                  status: 500,
                  title: 'Internal Server Error',
                  detail: 'Internal Server Error',
                },
              });

              return;
            }

            res.json({
              data: {
                rooms: roomData.rooms.map(room => room.roomName),
                whisperRooms: roomData.whisperRooms.map(room => room.roomName),
              },
            });
          },
        });
      },
    });
  });

  /**
   * @api {get} /rooms/:id Retrieve specific room
   * @apiVersion 6.0.0
   * @apiName GetRoom
   * @apiGroup Rooms
   *
   * @apiHeader {String} Authorization Your JSON Web Token
   *
   * @apiDescription Retrieve a specific room, based on sent room name
   *
   * @apiParam {String} id Name of the room to retrieve
   *
   * @apiSuccess {Object} data
   * @apiSuccess {Object} data.room Found room. Empty if no room was found
   * @apiSuccessExample {json} Success-Response:
   *   {
   *    "data": {
   *      "room": {
   *        "roomName": "bb1",
   *        "owner": "rez",
   *        "bannedUsers": [
   *          "a1",
   *        ],
   *        "admins": [
   *          "rez2"
   *        ],
   *        "commands": [],
   *        "visibility": 1,
   *        "accessLevel": 1
   *      }
   *    }
   *  }
   */
  router.get('/:id', (req, res) => {
    if (!objectValidator.isValidData(req.params, { id: true })) {
      res.status(400).json({
        error: {
          status: 400,
          title: 'Missing data',
          detail: 'Unable to parse data',
        },
      });

      return;
    }

    authenticator.isUserAllowed({
      commandName: dbConfig.apiCommands.GetRoom.name,
      token: req.headers.authorization,
      callback: ({ error, data }) => {
        if (error) {
          if (error.type === errorCreator.ErrorTypes.DOESNOTEXIST) {
            res.status(404).json({
              error: {
                status: 404,
                title: 'Command does not exist',
                detail: 'Command does not exist',
              },
            });

            return;
          } else if (error.type === errorCreator.ErrorTypes.NOTALLOWED) {
            res.status(401).json({
              error: {
                status: 401,
                title: 'Unauthorized',
                detail: 'Invalid token',
              },
            });

            return;
          }

          res.status(500).json({
            error: {
              status: 500,
              title: 'Internal Server Error',
              detail: 'Internal Server Error',
            },
          });

          return;
        }

        dbRoom.getRoom({
          roomName: req.params.id,
          callback: ({ error: roomError, data: roomData }) => {
            if (roomError) {
              if (roomError.type === errorCreator.ErrorTypes.DOESNOTEXIST) {
                res.status(404).json({
                  error: {
                    status: 404,
                    title: 'Room does not exist',
                    detail: 'Room does not exist',
                  },
                });

                return;
              }

              res.status(500).json({
                error: {
                  status: 500,
                  title: 'Internal Server Error',
                  detail: 'Internal Server Error',
                },
              });

              return;
            } else if (data.user.accessLevel < roomData.room.visibility) {
              res.status(401).json({
                error: {
                  status: 401,
                  title: 'Unauthorized',
                  detail: 'Not allowed to retrieve room',
                },
              });

              return;
            }

            res.json({ data: roomData });
          },
        });
      },
    });
  });

  /**
   * @api {post} /rooms Create a room
   * @apiVersion 6.0.0
   * @apiName CreateRoom
   * @apiGroup Rooms
   *
   * @apiHeader {String} Authorization Your JSON Web Token
   *
   * @apiDescription Create a room
   *
   * @apiParam {Object} data
   * @apiParam {Object} data.room Room
   * @apiParam {String} data.room.roomName Name of the room to create
   * @apiParam {String} [data.room.password] Password for the room. Leave unset if you don't want to password-protect the room
   * @apiParam {Number} [data.room.visibility] Minimum access level required to see the room. 0 = ANONYMOUS. 1 = registered user. Default is 1.
   * @apiParam {Number} [data.room.accessLevel] Minimum access level required to follow the room. 0 = ANONYMOUS. 1 = registered user. Default is 1.
   * @apiParamExample {json} Request-Example:
   *   {
   *    "data": {
   *      "room": {
   *        "roomName": "bb1",
   *        "accessLevel": 0
   *      }
   *    }
   *  }
   *
   * @apiSuccess {Object} data
   * @apiSuccess {Object} data.room Room created
   * @apiSuccessExample {json} Success-Response:
   *   {
   *    "data": {
   *      "room": {
   *        "roomName": "bb1",
   *        "owner": "rez",
   *        "bannedUsers": [],
   *        "admins": [],
   *        "commands": [],
   *        "visibility": 1,
   *        "accessLevel": 0,
   *        password: false
   *      }
   *    }
   *  }
   */
  router.post('/', (req, res) => {
    if (!objectValidator.isValidData(req.body, { data: { room: { roomName: true } } })) {
      res.status(400).json({
        error: {
          status: 400,
          title: 'Missing data',
          detail: 'Unable to parse data',
        },
      });

      return;
    }

    authenticator.isUserAllowed({
      commandName: dbConfig.apiCommands.CreateRoom.name,
      token: req.headers.authorization,
      callback: ({ error, data }) => {
        if (error) {
          if (error.type === errorCreator.ErrorTypes.DOESNOTEXIST) {
            res.status(404).json({
              error: {
                status: 404,
                title: 'Command does not exist',
                detail: 'Command does not exist',
              },
            });

            return;
          } else if (error.type === errorCreator.ErrorTypes.NOTALLOWED) {
            res.status(401).json({
              error: {
                status: 401,
                title: 'Unauthorized',
                detail: 'Invalid token',
              },
            });

            return;
          }

          res.status(500).json({
            error: {
              status: 500,
              title: 'Internal Server Error',
              detail: 'Internal Server Error',
            },
          });

          return;
        }

        const newRoom = req.body.data.room;
        newRoom.roomName = newRoom.roomName.toLowerCase();
        newRoom.owner = data.user.userName;

        manager.createRoom({
          room: newRoom,
          user: data.user,
          callback: ({ error: roomError, data: roomData }) => {
            if (roomError) {
              if (roomError.type === errorCreator.ErrorTypes.ALREADYEXISTS) {
                res.status(403).json({
                  error: {
                    status: 403,
                    title: 'Room already exists',
                    detail: 'Room already exists',
                  },
                });

                return;
              }

              res.status(500).json({
                error: {
                  status: 500,
                  title: 'Internal Server Error',
                  detail: 'Internal Server Error',
                },
              });

              return;
            }

            res.json({ data: roomData });
          },
        });
      },
    });
  });

  /**
   * @api {post} /rooms/follow Follow a room
   * @apiVersion 6.0.0
   * @apiName FollowRoom
   * @apiGroup Rooms
   *
   * @apiHeader {string} Authorization Your JSON Web Token
   *
   * @apiDescription Follow a room
   *
   * @apiParam {Object} data
   * @apiParam {Object} data.room Room
   * @apiParam {string} data.room.roomName Name of the room
   * @apiParam {string} [data.room.password] Password for the room
   * @apiParamExample {json} Request-Example:
   *   {
   *    "data": {
   *      "room": {
   *        "room": "broom",
   *        "password": "password"
   *      }
   *    }
   *  }
   *
   * @apiSuccess {Object} data
   * @apiSuccess {Object} data.room Room
   * @apiSuccess {String} data.room.roomName Name of the room that is followed
   * @apiSuccessExample {json} Success-Response:
   *   {
   *    "data": {
   *      "room": {
   *        "roomName": "broom"
   *      }
   *    }
   *  }
   */
  router.post('/follow', (req, res) => {
    if (!objectValidator.isValidData(req.body, { data: { room: { roomName: true } } })) {
      res.status(400).json({
        error: {
          status: 400,
          title: 'Missing data',
          detail: 'Unable to parse data',
        },
      });

      return;
    }

    authenticator.isUserAllowed({
      commandName: dbConfig.apiCommands.FollowRoom.name,
      token: req.headers.authorization,
      callback: ({ error, data }) => {
        if (error) {
          if (error.type === errorCreator.ErrorTypes.DOESNOTEXIST) {
            res.status(404).json({
              error: {
                status: 404,
                title: 'Command does not exist',
                detail: 'Command does not exist',
              },
            });

            return;
          } else if (error.type === errorCreator.ErrorTypes.NOTALLOWED) {
            res.status(401).json({
              error: {
                status: 401,
                title: 'Unauthorized',
                detail: 'Invalid token',
              },
            });

            return;
          }

          res.status(500).json({
            error: {
              status: 500,
              title: 'Internal Server Error',
              detail: 'Internal Server Error',
            },
          });

          return;
        }

        const { roomName, password } = req.body.data.room;

        // Checks that the user trying to add a user to a room has access to it
        dbRoom.authUserToRoom({
          roomName,
          password,
          user: data.user,
          callback: ({ error: roomError, data: roomData }) => {
            if (roomError) {
              if (roomError.type === errorCreator.ErrorTypes.NOTALLOWED) {
                res.status(401).json({
                  error: {
                    status: 401,
                    title: 'Not authorized to follow room',
                    detail: 'Your user is not allowed to follow the room',
                  },
                });

                return;
              }

              res.status(500).json({
                error: {
                  status: 500,
                  title: 'Internal Server Error',
                  detail: 'Internal Server Error',
                },
              });

              return;
            }

            dbUser.addRoomToUser({
              userName: data.user.userName,
              roomName: roomData.room.roomName,
              callback: ({ error: addError, data: userData }) => {
                if (addError) {
                  res.status(500).json({
                    error: {
                      status: 500,
                      title: 'Internal Server Error',
                      detail: 'Internal Server Error',
                    },
                  });

                  return;
                }

                const { user } = userData;

                if (user.socketId) {
                  io.to(user.socketId).emit('follow', { room: roomData.room });
                }

                res.json({ data: roomData });
              },
            });
          },
        });
      },
    });
  });

  /**
   * @api {post} /rooms/unfollow Unfollow a room
   * @apiVersion 6.0.0
   * @apiName UnfollowRoom
   * @apiGroup Rooms
   *
   * @apiHeader {String} Authorization Your JSON Web Token
   *
   * @apiDescription Unfollow a room
   *
   * @apiParam {Object} data
   * @apiParam {Object} data.room Room
   * @apiParam {String} data.room.roomName Name of the room to unfollow
   * @apiParamExample {json} Request-Example:
   *   {
   *    "data": {
   *      "room": {
   *        "roomName": "bb1"
   *      }
   *    }
   *  }
   *
   * @apiSuccess {Object} data
   * @apiSuccess {Object} data.room Room
   * @apiSuccess {String} data.room.roomName Name of the room that was unfollowed
   * @apiSuccessExample {json} Success-Response:
   *   {
   *    "data": {
   *      "room": {
   *        "roomName": "bb1"
   *      }
   *    }
   *  }
   */
  router.post('/unfollow', (req, res) => {
    if (!objectValidator.isValidData(req.body, { data: { room: { roomName: true } } })) {
      res.status(400).json({
        error: {
          status: 400,
          title: 'Missing data',
          detail: 'Unable to parse data',
        },
      });

      return;
    }

    authenticator.isUserAllowed({
      commandName: dbConfig.apiCommands.UnfollowRoom.name,
      token: req.headers.authorization,
      callback: ({ error, data }) => {
        if (error) {
          if (error.type === errorCreator.ErrorTypes.DOESNOTEXIST) {
            res.status(404).json({
              error: {
                status: 404,
                title: 'Command does not exist',
                detail: 'Command does not exist',
              },
            });

            return;
          } else if (error.type === errorCreator.ErrorTypes.NOTALLOWED) {
            res.status(401).json({
              error: {
                status: 401,
                title: 'Unauthorized',
                detail: 'Invalid token',
              },
            });

            return;
          }

          res.status(500).json({
            error: {
              status: 500,
              title: 'Internal Server Error',
              detail: 'Internal Server Error',
            },
          });

          return;
        }

        const { roomName } = req.body.data.room;

        dbUser.removeRoomFromUser({
          roomName,
          userName: data.user.userName,
          callback: ({ error: userError, data: userData }) => {
            if (userError) {
              if (userError.type === errorCreator.ErrorTypes.DOESNOTEXIST) {
                res.status(404).json({
                  error: {
                    status: 404,
                    title: 'Room does not exist',
                    detail: 'User is not following room',
                  },
                });

                return;
              }

              res.status(500).json({
                error: {
                  status: 500,
                  title: 'Internal Server Error',
                  detail: 'Internal Server Error',
                },
              });

              return;
            }

            const { user } = userData;

            if (user.socketId) {
              io.to(user.socketId).emit('unfollow', { room: { roomName } });
            }

            res.json({ data: { room: { roomName } } });
          },
        });
      },
    });
  });

  return router;
}

module.exports = handle;
