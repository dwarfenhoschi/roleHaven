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

const objectValidator = require('../../utils/objectValidator');
const manager = require('../../socketHelpers/manager');
const appConfig = require('../../config/defaults/config').app;
const dbConfig = require('../../config/defaults/config').databasePopulation;
const http = require('http');
const request = require('request');
const errorCreator = require('../../objects/error/errorCreator');
const dbLanternHack = require('../../db/connectors/lanternhack');

const signalThreshold = 50;
const signalDefault = 100;
const changePercentage = 0.2;
const signalMaxChange = 10;
let resetInterval = null;

/**
 * Post request to external server
 * @param {string} params.host - Host name
 * @param {string} params.path - Path
 * @param {Function} params.callback - Path
 * @param {Object} params.data - Data to send
 */
function postRequest({ host, path, data, callback }) {
  const dataString = JSON.stringify({ data });
  const options = {
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': dataString.length,
    },
    method: 'POST',
    host,
    path,
  };

  const req = http.request(options, (response) => {
    response.on('end', () => {
      callback(response.statusCode);
    });
  });

  req.write(dataString);
  req.end();
}

/**
 * Create signal value reset interval
 */
function setResetInterval() {
  /**
   * Lower/increase signal value on all stations towards default value
   * @private
   */
  function resetStations() {
    dbLanternHack.getAllStations((err, stations) => {
      if (err) {
        return;
      }

      stations.forEach((station) => {
        const signalValue = station.signalValue;
        const stationId = station.stationId;
        let newSignalValue = signalValue;

        if (signalValue !== signalDefault) {
          if (signalValue > signalDefault) {
            newSignalValue -= 1;
          } else {
            newSignalValue += 1;
          }

          dbLanternHack.updateSignalValue(stationId, newSignalValue, (signErr) => {
            if (signErr) {
              return;
            }

            // postRequest({
            //   host: appConfig.hackingApiHost,
            //   path: '/reports/set_boost',
            //   data: {
            //     station: stationId,
            //     boost: newSignalValue,
            //     key: appConfig.hackingApiKey,
            //   },
            //   callback: () => {
            //   },
            // });
          });
        }
      });
    });
  }

  if (appConfig.signalResetInterval !== 0) {
    if (resetInterval === null) {
      resetInterval = setInterval(resetStations, appConfig.signalResetInterval);
    } else {
      clearInterval(resetInterval);
      resetInterval = setInterval(resetStations, appConfig.signalResetInterval);
    }
  }
}

/**
 * @private
 * @param {string[]} array - Array to be shuffled
 * @returns {string[]} Shuffled array
 */
function shuffleArray(array) {
  const shuffledArray = array;
  let currentIndex = array.length;
  let tempVal;
  let randIndex;

  while (currentIndex !== 0) {
    randIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;
    tempVal = array[currentIndex];
    shuffledArray[currentIndex] = array[randIndex];
    shuffledArray[randIndex] = tempVal;
  }

  return shuffledArray;
}

/**
 * Fetch station status from external server
 * @param {Function} callback - Callback
 */
function retrieveStationStats(callback) {
  // request.get('http://wrecking.bbreloaded.se/public.json', (err, response, body) => {
  //   if (err) {
  //     console.log('Error request', response, err);
  //
  //     return;
  //   }
  //
  //   if (body) {
  //     /**
  //      * @type {{ stations: Object[], teams: Object[], active_round: Object, coming_rounds: Object[] }}
  //      */
  //     const stats = JSON.parse(body);
  //     const stations = stats.stations;
  //     const teams = stats.teams;
  //     const currentRound = stats.active_round;
  //     const futureRounds = stats.coming_rounds;
  //
  //     callback(stations, teams, currentRound, futureRounds);
  //   }
  // });

  // Temporary until external server is available
  const past = new Date();
  past.setDate(past.getDate() - 10);
  const future = new Date();
  future.setDate(future.getDate() + 10);

  callback({
    stations: [{
      id: 1,
      location: 'north',
      owner: 'alpha',
      active: true,
      boost: 97,
    }, {
      id: 2,
      location: 'south',
      owner: 'beta',
      active: false,
      boost: 110,
    }],
    teams: [{
      name: 'Team alpha',
      short_name: 'alpha',
      points: 573,
      active: true,
    }, {
      name: 'Team beta',
      short_name: 'beta',
      points: 1028,
      active: false,
    }],
    activeRound: {
      startTime: past,
      endTime: future,
    },
    futureRounds: [{
      startTime: past.setDate(past.getDate() - 1),
      endTime: future.setDate(future.getDate() + 1),
    }],
  });
}

/**
 * Update signal value on a station
 * @param {number} stationId Station ID
 * @param {boolean} boostingSignal Should the signal be increased?
 * @param {Function} callback Callback
 */
function updateSignalValue(stationId, boostingSignal, callback = () => {}) {
  dbLanternHack.getStation(stationId, (err, station) => {
    if (err) {
      callback({ error: new errorCreator.Database() });

      return;
    }

    /**
     * Set new signalvalue
     * @private
     * @param {number} newSignalValue - New value
     */
    function setNewValue(newSignalValue) {
      const minValue = signalDefault - signalThreshold;
      const maxValue = signalDefault + signalThreshold;
      let ceilSignalValue = Math.ceil(newSignalValue);

      if (ceilSignalValue > maxValue) {
        ceilSignalValue = maxValue;
      } else if (ceilSignalValue < minValue) {
        ceilSignalValue = minValue;
      }

      dbLanternHack.updateSignalValue(stationId, ceilSignalValue, (updateErr) => {
        if (updateErr) {
          callback({ error: new errorCreator.Database() });

          return;
        }

        // TODO Temporary until external server is up
        callback({ data: { response: 'good' } });
        // postRequest({
        //   host: appConfig.hackingApiHost,
        //   path: '/reports/set_boost',
        //   data: {
        //     station: stationId,
        //     boost: ceilSignalValue,
        //     key: appConfig.hackingApiKey,
        //   },
        //   callback: (response) => {
        //     callback({ data: { response } });
        //   },
        // });
      });
    }

    const signalValue = station.signalValue;
    const difference = Math.abs(signalValue - signalDefault);
    let signalChange = (signalThreshold - difference) * changePercentage;

    if (boostingSignal && signalValue < signalDefault) {
      signalChange = signalMaxChange;
    } else if (!boostingSignal && signalValue > signalDefault) {
      signalChange = signalMaxChange;
    }

    setNewValue(signalValue + (boostingSignal ? signalChange : -Math.abs(signalChange)));
  });
}

/**
 * Create client hack data
 * @param {Object} lanternHack Lantern hack
 * @param {Function} callback Callback
 */
function createHackData({ lanternHack, callback = () => {} }) {
  dbLanternHack.getAllFakePasswords((errFake, retrievedPasswords) => {
    if (errFake) {
      callback({ error: new errorCreator.Database() });

      return;
    }

    callback({ data: { passwords: shuffleArray(retrievedPasswords.map(password => password.password)).slice(0, 6).concat(lanternHack.gameUsers.map(gameUser => gameUser.password)) } });
  });
}

/**
 * Create lantern hack for user
 * @param {number} stationId Station id
 * @param {string} owner User name of the hack owner
 * @param {Function} callback Callback
 */
function createHackLantern({ stationId, owner, callback = () => {} }) {
  dbLanternHack.getGameUsers({ stationId }, (err, retrievedUsers) => {
    if (err) {
      callback({ error: new errorCreator.Database() });

      return;
    }

    const gameUsers = shuffleArray(retrievedUsers).slice(0, 2).map((gameUser) => {
      return { userName: gameUser.userName, password: shuffleArray(gameUser.passwords)[0] };
    });

    // Set first game user + password to the right combination
    gameUsers[0].isCorrect = true;

    dbLanternHack.updateLanternHack({ owner, gameUsers }, (updateErr, updatedHack) => {
      if (updateErr) {
        callback({ error: new errorCreator.Database() });

        return;
      }

      callback({ data: { lanternHack: updatedHack } });
    });
  });
}

/**
 * @param {Object} socket - Socket.IO socket
 */
function handle(socket) {
  socket.on('manipulateStation', ({ password, shouldAmplify }, callback = () => {}) => {
    if (!objectValidator.isValidData({ password, shouldAmplify }, { password: true, shouldAmplify: true })) {
      callback({ error: new errorCreator.InvalidData({ expected: '{ password, shouldAmplify }' }) });

      return;
    }

    manager.userIsAllowed(socket.id, dbConfig.commands.hackLantern.commandName, (allowErr, allowed, allowedUser) => {
      if (allowErr) {
        callback({ error: new errorCreator.Database() });

        return;
      } else if (!allowed) {
        callback({ error: new errorCreator.NotAllowed({ name: 'manipulateStation' }) });

        return;
      }

      dbLanternHack.getLanternHack(allowedUser.userName, (err, lanternHack) => {
        if (err) {
          callback({ error: new errorCreator.Database() });

          return;
        } else if (!lanternHack) {
          callback({ error: new errorCreator.DoesNotExist({ name: 'lantern hack' }) });

          return;
        }

        const correctUser = lanternHack.gameUsers.find(gameUser => gameUser.correct);

        if (correctUser.password === password.toLowerCase() && lanternHack.triesLeft > 0) {
          updateSignalValue(lanternHack.stationId, shouldAmplify, ({ error }) => {
            if (error) {
              callback({ error: new errorCreator.External({ name: 'wrecking' }) });

              return;
            }

            dbLanternHack.removeLanternHack(allowedUser.userName, (removeErr) => {
              if (removeErr) {
                callback({ error: new errorCreator.Database() });

                return;
              }

              callback({ data: { success: true, amplified: shouldAmplify } });
            });
          });
        } else {
          dbLanternHack.lowerHackTries(allowedUser.userName, (lowerErr, loweredHack) => {
            if (lowerErr) {
              callback({ error: new errorCreator.Database() });

              return;
            }

            if (loweredHack.triesLeft <= 0) {
              dbLanternHack.removeLanternHack(allowedUser.userName, (removeErr) => {
                if (removeErr) {
                  callback({ error: new errorCreator.Database() });

                  return;
                }

                callback({ data: { success: false, triesLeft: loweredHack.triesLeft } });
              });
            } else {
              callback({ data: { success: false, triesLeft: loweredHack.triesLeft } });
            }
          });
        }
      });
    });
  });

  socket.on('getLanternHack', ({ stationId }, callback = () => {}) => {
    if (!objectValidator.isValidData({ stationId }, { stationId: true })) {
      callback({ error: new errorCreator.InvalidData({ expected: '' }) });

      return;
    }

    manager.userIsAllowed(socket.id, dbConfig.commands.hackLantern.commandName, (allowErr, allowed, allowedUser) => {
      if (allowErr) {
        callback({ error: new errorCreator.Database() });

        return;
      } else if (!allowed) {
        callback({ error: new errorCreator.NotAllowed({ name: 'getLanternHack' }) });

        return;
      }

      dbLanternHack.getLanternHack(allowedUser.userName, (hackErr, lanternHack) => {
        /**
         * Generates a new hack if the chosen station is different from the users previous choice
         * Different users + passwords are connected to specific stations
         */
        if (!lanternHack || lanternHack.stationId !== stationId) {
          createHackLantern({
            owner: allowedUser.userName,
            stationId,
            callback: ({ error, data }) => {
              if (error) {
                callback({ error });

                return;
              }

              createHackData({
                lanternHack: data.lanternHack,
                callback: ({ error: hackDataErr, data: hackData }) => {
                  if (hackDataErr) {
                    callback({ error: hackDataErr });

                    return;
                  }

                  callback({ data: { passwords: hackData.passwords } });
                },
              });
            },
          });
        } else {
          createHackData({
            lanternHack,
            callback: ({ error: hackDataErr, data: hackData }) => {
              if (hackDataErr) {
                callback({ error: hackDataErr });

                return;
              }

              callback({ data: { passwords: hackData.passwords } });
            },
          });
        }
      });
    });
  });

  socket.on('getStations', (params, callback = () => {}) => {
    dbLanternHack.getAllStations((err, stations) => {
      const activeStations = [];
      const inactiveStations = stations.filter((station) => {
        if (station.isActive) {
          activeStations.push(station);

          return false;
        }

        return true;
      });

      callback({ data: { activeStations, inactiveStations } });
    });
  });
}

setResetInterval();

exports.handle = handle;
