const errorCreator = require('../objects/error/errorCreator');
const appConfig = require('../config/defaults/config').app;

/**
 * Checks the type of error and sends it in response.
 * @param {Object} params - Parameters.
 * @param {Object} params.response - Router response.
 * @param {Object} params.error - Error object.
 * @param {string} [params.title] - Error title.
 * @param {string} [params.detail] - Error detail.
 * @param {Object} [params.sentData] - Data sent.
 */
function checkAndSendError({
  response,
  error,
  title,
  detail,
  sentData,
}) {
  const errorDetail = detail || error.text.join('');
  const sendError = {
    status: 500,
    title: title || 'Internal server error',
    detail: errorDetail || 'Internal server error',
  };

  if ((appConfig.mode === appConfig.Modes.TEST || appConfig.mode === appConfig.Modes.DEV) && sentData) {
    sendError.sentData = sentData;
  }

  switch (error.type) {
    case errorCreator.ErrorTypes.DOESNOTEXIST: {
      sendError.status = 404;
      sendError.title = title || 'Does not exist';
      sendError.detail = errorDetail || 'Does not exist';

      break;
    }
    case errorCreator.ErrorTypes.NOTALLOWED: {
      sendError.status = 401;
      sendError.title = title || 'Unauthorized';
      sendError.detail = errorDetail || 'Not allowed';

      break;
    }
    case errorCreator.ErrorTypes.INVALIDCHARACTERS: {
      sendError.status = 400;
      sendError.title = title || 'Invalid characters or length';
      sendError.detail = errorDetail || 'Invalid characters or length';

      break;
    }
    case errorCreator.ErrorTypes.INSUFFICIENT: {
      sendError.status = 400;
      sendError.title = title || 'Insufficient';
      sendError.detail = errorDetail || 'Insufficient';

      break;
    }
    case errorCreator.ErrorTypes.ALREADYEXISTS: {
      sendError.status = 403;
      sendError.title = title || 'Already exists';
      sendError.detail = errorDetail || 'Already exists';

      break;
    }
    case errorCreator.ErrorTypes.INVALIDDATA: {
      sendError.status = 400;
      sendError.title = title || 'Invalid data';
      sendError.detail = errorDetail || 'Invalid data';

      break;
    }
    case errorCreator.ErrorTypes.INVALIDMAIL: {
      sendError.status = 400;
      sendError.title = title || 'Invalid mail address';
      sendError.detail = errorDetail || 'Invalid mail address';

      break;
    }
    default: {
      break;
    }
  }

  response.status(sendError.status).json({
    error: sendError,
  });
}

exports.checkAndSendError = checkAndSendError;
