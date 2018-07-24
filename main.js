/**
 * Copyright 2017 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

'use strict';

const alexaVerifier = require('alexa-verifier');
var AssistantV1 = require('watson-developer-cloud/assistant/v1');
const openwhisk = require('openwhisk');
const request = require('request');

function errorResponse(reason) {
  return {
    version: '1.0',
    response: {
      shouldEndSession: true,
      outputSpeech: {
        type: 'PlainText',
        text: reason || 'An unexpected error occurred. Please try again later.'
      }
    }
  };
}

// Using some globals for now
let assistant;
let context;

function verifyFromAlexa(args, rawBody) {
  return new Promise(function(resolve, reject) {
    const certUrl = args.__ow_headers.signaturecertchainurl;
    const signature = args.__ow_headers.signature;
    alexaVerifier(certUrl, signature, rawBody, function(err) {
      if (err) {
        console.error('err? ' + JSON.stringify(err));
        throw new Error('Alexa verification failed.');
      }
      resolve();
    });
  });
}

function initClients(args) {
  // Connect a client to Watson Assistant
  assistant = new AssistantV1({
    username: args.CONVERSATION_USERNAME,
    password: args.CONVERSATION_PASSWORD,
    url: 'https://gateway.watsonplatform.net/assistant/api/',
    version: '2018-07-10'
  });
  console.log('Connected to Watson Conversation');
}

function conversationMessage(request, workspaceId) {
  return new Promise(function(resolve, reject) {
    const input = request.intent ? request.intent.slots.EveryThingSlot.value : 'start skill';
    console.log('WORKSPACE_ID: ' + workspaceId);
    console.log('Input text: ' + input);

    assistant.message(
      {
        input: { text: input },
        workspace_id: workspaceId,
        context: context
      },
      function(err, watsonResponse) {
        if (err) {
          console.error(err);
          reject('Error talking to Watson.');
        } else {
          console.log(watsonResponse);
          context = watsonResponse.context; // Update global context
          resolve(watsonResponse);
        }
      }
    );
  });
}

function myOpenWhisk() {
  return openwhisk();
}

function sendResponse(response, resolve) {
  console.log('Begin sendResponse');
  console.log(response);

  // Combine the output messages into one message.
  const output = response.output.text.join(' ');
  console.log('Output text: ' + output);

  // Resolve the main promise now that we have our response
  resolve({
    version: '1.0',
    response: {
      shouldEndSession: false,
      outputSpeech: {
        type: 'PlainText',
        text: output
      }
    }
  });
}

function main(args) {
  console.log('Begin action');
  // console.log(args);
  return new Promise(function(resolve, reject) {
    if (!args.__ow_body) {
      return reject(errorResponse('Must be called from Alexa.'));
    }

    const rawBody = Buffer.from(args.__ow_body, 'base64').toString('ascii');
    const body = JSON.parse(rawBody);
    const sessionId = body.session.sessionId;
    const request = body.request;

    verifyFromAlexa(args, rawBody)
      .then(() => initClients(args))
      .then(() => conversationMessage(request, args.WORKSPACE_ID))
      .then(actionResponse => sendResponse(actionResponse, resolve))
      .catch(err => {
        console.error('Caught error: ');
        console.log(err);
        reject(errorResponse(err));
      });
  });
}

exports.main = main;