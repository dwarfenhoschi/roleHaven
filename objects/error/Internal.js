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

const GeneralError = require('./GeneralError');

class Internal extends GeneralError.create {
  /**
   * Create an internal error object.
   * Indicates that something went wrong locally
   * @param {Object} params - Parameters.
   * @param {string} [params.name] - Retrieval source.
   * @param {Error} [params.errorObject] - Error object.
   */
  constructor({
    errorObject,
    verbose,
    extraData,
    name = '-',
  }) {
    super({
      errorObject,
      verbose,
      extraData,
      type: GeneralError.ErrorTypes.INTERNAL,
      text: [`Failed to retrieve data from ${name}`],
    });
  }
}

module.exports = Internal;
