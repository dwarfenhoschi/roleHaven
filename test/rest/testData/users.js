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

const appConfig = require('../../../config/defaults/config').app;
const tools = require('../helper/tools');

const data = {};

data.create = {
  first: {
    username: tools.createRandString({ length: appConfig.usernameMaxLength }),
    password: tools.createRandString({ length: appConfig.passwordMaxLength }),
    registerDevice: tools.createRandString({ length: appConfig.deviceIdLength }),
  },
  second: {
    username: tools.createRandString({ length: appConfig.usernameMaxLength }),
    password: tools.createRandString({ length: appConfig.passwordMaxLength }),
    registerDevice: tools.createRandString({ length: appConfig.deviceIdLength }),
  },
};

data.update = {
  toUpdate: {
    username: tools.createRandString({ length: appConfig.usernameMaxLength }),
    password: tools.createRandString({ length: appConfig.passwordMaxLength }),
    registerDevice: tools.createRandString({ length: appConfig.deviceIdLength }),
  },
  updateWith: {
    username: tools.createRandString({ length: appConfig.usernameMaxLength }),
  },
};

data.remove = {
  toRemove: {
    username: tools.createRandString({ length: appConfig.usernameMaxLength }),
    password: tools.createRandString({ length: appConfig.passwordMaxLength }),
    registerDevice: tools.createRandString({ length: appConfig.deviceIdLength }),
  },
  secondToRemove: {
    username: tools.createRandString({ length: appConfig.usernameMaxLength }),
    password: tools.createRandString({ length: appConfig.passwordMaxLength }),
    registerDevice: tools.createRandString({ length: appConfig.deviceIdLength }),
  },
};

module.exports = data;
