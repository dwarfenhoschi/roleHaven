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

const tools = require('../helper/tools');

const schemas = {};

schemas.liteDocFile = tools.buildLiteSchema({
  type: 'object',
  required: [
    'title',
  ],
  properties: {
    title: { type: 'string' },
    code: { type: 'string' },
  },
});

schemas.docFile = tools.buildLiteSchema({
  type: 'object',
  required: [
    'code',
    'title',
    'text',
  ],
  properties: {
    code: { type: 'string' },
    title: { type: 'string' },
    text: {
      type: 'array',
      items: { type: 'string' },
    },
  },
});

schemas.fullDocFile = tools.buildFullSchema({
  type: 'object',
  required: [
    'code',
    'title',
    'text',
  ],
  properties: {
    code: { type: 'string' },
    title: { type: 'string' },
    text: {
      type: 'array',
      items: { type: 'string' },
    },
  },
});

schemas.docFiles = {
  type: 'array',
  items: schemas.docFile,
};

schemas.fullDocFiles = {
  type: 'array',
  items: schemas.fullDocFile,
};

schemas.liteDocFiles = {
  type: 'array',
  items: schemas.liteDocFile,
};

module.exports = schemas;
