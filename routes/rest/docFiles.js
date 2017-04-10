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
const objectValidator = require('../../utils/objectValidator');
const appConfig = require('../../config/defaults/config').app;
const dbDocFile = require('../../db/connectors/docFile');
const jwt = require('jsonwebtoken');

const router = new express.Router();

/**
 * @param {object} io - Socket.IO
 * @returns {Object} Router
 */
function handle(io) {
  /**
   * @api {get} /docFiles Retrieve all public docFiles
   * @apiVersion 5.0.1
   * @apiName GetPublicDocFiles
   * @apiGroup DocFiles
   *
   * @apiHeader {String} Authorization Your JSON Web Token
   *
   * @apiDescription Retrieve all public docFiles
   *
   * @apiSuccess {Object} data
   * @apiSuccess {Object[]} data.docFiles All public docFiles. Empty if no match was found
   * @apiSuccessExample {json} Success-Response:
   *  {
   *    "data": {
   *      "docFiles": [
   *        {
   *          "_id": "58093459d3b44c3400858273",
   *          "title": "Hello",
   *          "docFileId": "hello",
   *          "creator": "rez5",
   *          "text": [
   *            "Hello world!",
   *            "This is great"
   *          ],
   *          "isPublic": true,
   *          "visibility": 0
   *        }
   *      ]
   *    }
   *  }
   */
  router.get('/', (req, res) => {
    // noinspection JSUnresolvedVariable
    jwt.verify(req.headers.authorization || '', appConfig.jsonKey, (jwtErr, decoded) => {
      if (jwtErr) {
        res.status(500).json({
          errors: [{
            status: 500,
            title: 'Internal Server Error',
            detail: 'Internal Server Error',
          }],
        });

        return;
      } else if (!decoded) {
        res.status(401).json({
          errors: [{
            status: 401,
            title: 'Unauthorized',
            detail: 'Invalid token',
          }],
        });

        return;
      }

      dbDocFile.getDocFilesList(decoded.data.accessLevel, decoded.data.userName, (docFileErr, docFiles) => {
        if (docFileErr) {
          res.status(500).json({
            errors: [{
              status: 500,
              title: 'Internal Server Error',
              detail: 'Internal Server Error',
            }],
          });

          return;
        }

        res.json({ data: { docFiles } });
      });
    });
  });

  /**
   * @api {get} /docFiles/:id Retrieve specific docFile
   * @apiVersion 5.0.1
   * @apiName GetDocFile
   * @apiGroup DocFiles
   *
   * @apiHeader {String} Authorization Your JSON Web Token
   *
   * @apiDescription Retrieve a specific docFile based on the sent docFile ID
   *
   * @apiParam {String} id The docFile ID.
   *
   * @apiSuccess {Object} data
   * @apiSuccess {Object[]} data.docFiles Found docFile with sent docFile ID. Empty if no match was found
   * @apiSuccessExample {json} Success-Response:
   *  {
   *    "data": {
   *      "docFiles": [
   *        {
   *          "_id": "58093459d3b44c3400858273",
   *          "title": "Hello",
   *          "docFileId": "hello",
   *          "creator": "rez5",
   *          "text": [
   *            "Hello world!",
   *            "This is great"
   *          ],
   *          "isPublic": true,
   *          "visibility": 0
   *        }
   *      ]
   *    }
   *  }
   */
  router.get('/:id', (req, res) => {
    // noinspection JSUnresolvedVariable
    jwt.verify(req.headers.authorization || '', appConfig.jsonKey, (jwtErr, decoded) => {
      if (jwtErr) {
        res.status(500).json({
          errors: [{
            status: 500,
            title: 'Internal Server Error',
            detail: 'Internal Server Error',
          }],
        });

        return;
      } else if (!decoded) {
        res.status(401).json({
          errors: [{
            status: 401,
            title: 'Unauthorized',
            detail: 'Invalid token',
          }],
        });

        return;
      }

      dbDocFile.getDocFile(req.params.id, decoded.data.accessLevel, (docFileErr, docFile) => {
        if (docFileErr) {
          res.status(500).json({
            errors: [{
              status: 500,
              title: 'Internal Server Error',
              detail: 'Internal Server Error',
            }],
          });

          return;
        }

        res.json({ data: { docFiles: [docFile] } });
      });
    });
  });

  /**
   * @api {post} /docFiles Create an docFile
   * @apiVersion 5.0.1
   * @apiName CreateDocFile
   * @apiGroup DocFiles
   *
   * @apiHeader {String} Authorization Your JSON Web Token
   *
   * @apiDescription Create an docFile
   *
   * @apiParam {Object} data
   * @apiParam {Object} data.docFile DocFile
   * @apiParam {String} data.docFile.title Title for the docFile
   * @apiParam {String} data.docFile.docFileId ID of the docFile. Will be used to retrieve this specific docFile
   * @apiParam {String[]} data.docFile.text Content of the docFile
   * @apiParam {Boolean} data.docFile.isPublic Should the docFile be public? Non-public docFiles can only be retrieved with its docFile ID
   * @apiParamExample {json} Request-Example:
   *   {
   *    "data": {
   *      "docFiles": [
   *        {
   *          "title": "Hello",
   *          "docFileId": "hello",
   *          "text": [
   *            "Hello world!",
   *            "This is great"
   *          ],
   *          "isPublic": true
   *        }
   *      ]
   *    }
   *  }
   *
   * @apiSuccess {Object} data
   * @apiSuccess {Object[]} data.docFiles Found docFile with sent docFile ID. Empty if no match was found
   * @apiSuccessExample {json} Success-Response:
   *  {
   *    "data": {
   *      "docFile": {
 *          "_id": "58093459d3b44c3400858273",
 *          "title": "Hello",
 *          "docFileId": "hello",
 *          "creator": "rez5",
 *          "text": [
 *            "Hello world!",
 *            "This is great"
 *          ],
 *          "isPublic": true,
 *          "visibility": 0
 *        }
   *    }
   *  }
   */
  router.post('/', (req, res) => {
    if (!objectValidator.isValidData(req.body, { data: { docFile: { docFileId: true, text: true, title: true } } })) {
      res.status(400).json({
        errors: [{
          status: 400,
          title: 'Missing data',
          detail: 'Unable to parse data',
        }],
      });

      return;
    }

    // noinspection JSUnresolvedVariable
    jwt.verify(req.headers.authorization || '', appConfig.jsonKey, (jwtErr, decoded) => {
      if (jwtErr) {
        res.status(500).json({
          errors: [{
            status: 500,
            title: 'Internal Server Error',
            detail: 'Internal Server Error',
          }],
        });

        return;
      } else if (!decoded) {
        res.status(401).json({
          errors: [{
            status: 401,
            title: 'Unauthorized',
            detail: 'Invalid token',
          }],
        });

        return;
      }

      const newDocFile = req.body.data.docFile;
      newDocFile.creator = decoded.data.userName;
      newDocFile.docFileId = newDocFile.docFileId.toLowerCase();

      dbDocFile.createDocFile(newDocFile, (docFileErr, docFile) => {
        if (docFileErr) {
          res.status(500).json({
            errors: [{
              status: 500,
              title: 'Internal Server Error',
              detail: 'Internal Server Error',
            }],
          });

          return;
        } else if (docFile === null) {
          res.status(402).json({
            errors: [{
              status: 402,
              title: 'DocFile already exists',
              detail: `DocFile with ID ${newDocFile.docFileId} already exists`,
            }],
          });

          return;
        }

        if (docFile.isPublic) {
          io.emit('docFile', { docFile });
        } else if (docFile.team && docFile.team !== '') {
          const teamRoom = newDocFile.team + appConfig.teamAppend;

          io.to(teamRoom).emit('docFile', { docFile });
        }

        res.json({ data: { docFile } });
      });
    });
  });

  return router;
}

module.exports = handle;