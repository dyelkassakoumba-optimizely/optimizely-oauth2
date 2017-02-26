'use strict'

const express = require('express')
const app = express()
const Bluebird = require('bluebird')
const open = require('open')
const request = Bluebird.promisify(require('request'))
Bluebird.promisifyAll(request)
let listener

OptimizelyOauth.DEFAULT_HOST = 'https://app.optimizely.com/oauth2/'
OptimizelyOauth.DEFAULT_REDIRECT_URI = 'http://localhost'
OptimizelyOauth.DEFAULT_REDIRECT_PORT = '8080'
OptimizelyOauth.DEFAULT_REDIRECT_PATH = '/authorize'
OptimizelyOauth.DEFAULT_RESPONSE_TYPE = 'code'
OptimizelyOauth.DEFAULT_SCOPE = 'all'

// Use node's default timeout:
OptimizelyOauth.DEFAULT_TIMEOUT = require('http').createServer().timeout
OptimizelyOauth.PACKAGE_VERSION = require('../package.json').version

function OptimizelyOauth (opts) {
  if (!opts) opts = {}
  if (!(this instanceof OptimizelyOauth)) return new OptimizelyOauth(opts)

  this.host = OptimizelyOauth.DEFAULT_HOST
  this._query = {}
  this._setRedirectPort(opts.redirectPort)
  this._setRedirectPath(opts.redirectPath)
  this._setRedirectUri(opts.redirectUri)
  this._setClientId(opts.clientId)
  this._setClientSecret(opts.clientSecret)
  this._setScope(opts.scope)
  this._setResponseType()
  this._setServerTimeout(opts.timeout)
}

OptimizelyOauth.prototype = {
  _setServerTimeout: function (timeout) {
    this.timeout = !timeout ? OptimizelyOauth.DEFAULT_TIMEOUT : timeout
  },

  _setClientId: function (clientId) {
    this._query.client_id = clientId
  },

  _setClientSecret: function (clientSecret) {
    this._query.client_secret = clientSecret
  },

  _setRefreshToken: function (refreshToken) {
    this._query.refresh_token = refreshToken
  },

  _setRedirectPort: function (redirectPort) {
    this.redirectPort = redirectPort || OptimizelyOauth.DEFAULT_REDIRECT_PORT
  },

  _setRedirectPath: function (redirectPath) {
    this.redirectPath = redirectPath || OptimizelyOauth.DEFAULT_REDIRECT_PATH
  },

  _setRedirectUri: function (redirectUri) {
    let redirectPath = redirectUri || `${OptimizelyOauth.DEFAULT_REDIRECT_URI}:${this.redirectPort}${this.redirectPath}`
    this._query.redirectUri = `&redirect_uri=${redirectPath}`
  },

  _setResponseType: function (responseType) {
    this._query.responseType = `&response_type=${responseType || OptimizelyOauth.DEFAULT_RESPONSE_TYPE}`
  },

  _setScope: function (scope) {
    this._query.scope = `&scope=${scope || OptimizelyOauth.DEFAULT_SCOPE}`
  },

  _setState: function (state) {
    this._query.state = state ? `&state=${state}` : ''
  },

  _setAccountId: function (accountId) {
    this._query.accountId = accountId ? `&account_id=${accountId}` : ''
  },

  getField: function (key) {
    return this._query[key]
  },

  getCredentials: function () {
    return this.credentials
  },

  getConstant: function (c) {
    return OptimizelyOauth[c]
  },

  _returnGetUrl: function () {
    if (!this._query.client_id) throw new Error('The `clientId` parameter has not been set')
    if (!this._query.client_secret) throw new Error('The `clientSecret` parameter has not been set')
    return `${this.host}authorize?client_id=${this._query.client_id}&client_secret=${this._query.client_secret}${this._query.redirectUri}${this._query.responseType}${this._query.scope}${this._query.state}${this._query.accountId}`
  },

  _returnPostUrl: function (code) {
    if (!this._query.client_id) throw new Error('The `clientId` parameter has not been set')
    if (!this._query.client_secret) throw new Error('The `clientSecret` parameter has not been set')
    return `${this.host}token?code=${code}&client_id=${this._query.client_id}&client_secret=${this._query.client_secret}${this._query.redirectUri}&grant_type=authorization_code`
  },

  _returnRefreshUrl: function (opts) {
    if (!this._query.client_id) throw new Error('The `clientId` parameter has not been set')
    if (!this._query.client_secret) throw new Error('The `clientSecret` parameter has not been set')
    if (!this._query.refresh_token) throw new Error('The `refreshToken` parameter has not been set')
    return `${this.host}token?refresh_token=${this._query.refresh_token}&client_id=${this._query.client_id}&client_secret=${this._query.client_secret}&grant_type=refresh_token`
  },

  _postRefreshCode: function (opts) {
    return request({
      url: `${this._returnRefreshUrl(opts)}`,
      method: 'POST',
      gzip: true,
      json: true,
      timeout: this.getField('timeout'),
      body: {}
    })
  },

  _postAuthCode: function (code) {
    return request({
      url: `${this._returnPostUrl(code)}`,
      method: 'POST',
      gzip: true,
      json: true,
      timeout: this.getField('timeout'),
      body: {}
    })
  },

  _initialize: function (opts) {
    if (!this._query.client_id) this._setClientId(opts.clientId || opts.client_id)
    if (!this._query.client_secret) this._setClientSecret(opts.clientSecret || opts.client_secret)
    if (!this._query.refresh_token) this._setRefreshToken(opts.refreshToken || opts.refresh_token)
    this._setAccountId(opts.accountId)
    this._setState(opts.state)
  },

  Authorize: function (opts) {
    return new Bluebird((resolve, reject) => {
      this._initialize(opts)
      app.get('/authorize', (req, res) => {
        return this._postAuthCode(req.query.code)
          .then(result => {
            res.status(200).send('Authorized Successfully')
            listener.close()
            return resolve({
              statusCode: result.statusCode,
              statusMessage: result.statusMessage,
              body: result.body
            })
          })
          .catch(err => {
            res.status(500).send('Authorization Failure')
            listener.close()
            return reject(err)
          })
      })
      listener = app.listen(this.redirectPort)
      open(this._returnGetUrl())
    })
  },

  Refresh: function (opts) {
    return new Bluebird((resolve, reject) => {
      if (!opts.refreshToken && !opts.refresh_token) throw new Error('The `refreshToken` property must be provided')
      this._initialize(opts)
      return this._postRefreshCode(opts)
        .then(result => resolve({
          statusCode: result.statusCode,
          statusMessage: result.statusMessage,
          body: result.body
        }))
        .catch(reject)
    })
  }
}

module.exports = OptimizelyOauth
