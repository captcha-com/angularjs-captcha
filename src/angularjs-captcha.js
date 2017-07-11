/* BotDetect AngularJS CAPTCHA Module */

(function(angular) {
  'use strict';

  /**
   * BotDetect Captcha module settings.
   */
  function captchaSettings() {
    var configuredSettings = {},
        captchaSettings = {
          captchaEndpoint: ''
        };

    return {
      setSettings: function(settings) {
        configuredSettings = settings;
      },

      $get: function() {
        angular.extend(captchaSettings, configuredSettings);
        return captchaSettings;
      }
    };
  }

  /**
   * Strip '/' character from the end of the given url.
   */
  function captchaEndpointFilter() {
    return function(url) {
      return url.replace(/\/+$/g, '');
    };
  }

  /**
   * Captcha helper that provides useful functions.
   */
  function captchaHelper($window) {
    return {
      // strip whitespace from the beginning and end of the given string
      trim: function(string) {
        return string.replace(/^\s+|\s+$/g, '');
      },

      // build url with parameters
      buildUrl: function(url, params) {
        var p = [];

        for (var key in params) {
          if (typeof key === 'string') {
            p.push(key + '=' + params[key]);
          }
        }

        var hasParamsPattern = /\?+/g;
        return hasParamsPattern.test(url) ? (url + '&' + p.join('&')) : (url + '?' + p.join('&'));
      },

      // create script include element
      scriptInclude: function(url, className, onLoadedCallback) {
        var script = $window.document.createElement('script');
            script.src = url;
            script.className = className;
            
        if (script.readyState) { // for IE
          script.onreadystatechange = function() {
            if ((script.readyState === 'loaded') 
                  || (script.readyState === 'complete')) {
              if (typeof onLoadedCallback === 'function') {
                onLoadedCallback();
              }
            }
          };
        } else {
          script.onload = function() {
            if (typeof onLoadedCallback === 'function') {
              onLoadedCallback();
            }
          };
        }
        
        return script;
      },

      // get configured base url in captcha html
      getBaseUrl: function(captchaHtml) {
        var baseUrl = '';
        var matched = captchaHtml.match(/id=['"]BDC_BaseUrl['"].*value=['"]([^'"]+)/);
        if (matched) {
          baseUrl = matched[1];
        }
        return baseUrl;
      }
    };
  }

  /**
   * <botdetect-captcha> directive element, which is used to display Captcha html markup.
   */
  function botdetectCaptchaDirective($document, $rootScope, $http, $filter, captchaSettings, captchaHelper) {
    return {
      restrict: 'E',
      link: function(scope, element, attrs) {
        var styleName = attrs.stylename ? attrs.stylename : 'defaultCaptcha';

        // save styleName in $rootScope, that will be used in correctCaptcha directive and Captcha service for getting BotDetect instance
        $rootScope.captchaStyleName = styleName;

        // normalize captcha endpoint path
        var captchaEndpoint = $filter('captchaEndpointFilter')(captchaHelper.trim(captchaSettings.captchaEndpoint));

        // body element
        var bodyElement = $document.find('body')[0];
        
        var addScriptToBody = function(baseUrl, callback) {
          if ($document[0].getElementsByClassName('BDC_ScriptInclude').length !== 0) {
            // BotDetect client-side script is already added
            return;
          }
          
          // build BotDetect client-side script include url
          var scriptIncludeUrl = captchaHelper.buildUrl(baseUrl + captchaEndpoint, {
            get: 'script-include'
          });
          
          angular.element(bodyElement).append(captchaHelper.scriptInclude(scriptIncludeUrl, 'BDC_ScriptInclude', callback));
        };
        
        var addInitScriptToBody = function(baseUrl) {
          // remove included BotDetect init script if it exists
          var initScriptIncluded = $document[0].getElementsByClassName('BDC_InitScriptInclude');
          if (initScriptIncluded.length !== 0) {
            initScriptIncluded[0].parentNode.removeChild(initScriptIncluded[0]);
          }
          
          // build BotDetect init script include url
          var initScriptIncludeUrl = captchaHelper.buildUrl(baseUrl + captchaEndpoint, {
            get: 'init-script-include',
            c: styleName,
            t: element[0].querySelector('#BDC_VCID_' + styleName).value,
            cs: '200'
          });

          // append BotDetect init script to body
          angular.element(bodyElement).append(captchaHelper.scriptInclude(initScriptIncludeUrl, 'BDC_InitScriptInclude'));
        };

        $http({
          method: 'GET',
          url: captchaEndpoint,
          params: {
            get: 'html',
            c: styleName
          }
        })
          .then(function(response) {
            var captchaHtml = response.data;
            var baseUrl = captchaHelper.getBaseUrl(captchaHtml);
            
            var displayHtml = function() {
              element.html(response.data.replace(/<script.*<\/script>/g, ''));
              addInitScriptToBody(baseUrl);
            };
            
            if ($rootScope.isBDScriptIncludeLoaded) {
              displayHtml();
            } else {
              var callback = function() {
                displayHtml();
                $rootScope.isBDScriptIncludeLoaded = true;
              };
              addScriptToBody(baseUrl, callback);
            }
          }, function(error) {
            throw new Error(error.data);
          });
      }
    };
  }

  /**
   * 'correct-captcha' directive attribute, which is used to perform ui captcha validaion.
   */
  function correctCaptchaDirective(Captcha) {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function(scope, element, attrs, ctrls) {
        var captcha,
            captchaCode,
            ngModel = ctrls;

        ngModel.$setValidity('incorrectCaptcha', false);

        // client-side validate captcha on blur event
        element.bind('blur', function() {
          captchaCode = element.val();

          if (!captchaCode) {
            return;
          }

          if (!captcha) {
            captcha = new Captcha();
          }

          captcha.validate(captchaCode)
            .then(function(isHuman) {
              if (isHuman) {
                // correct captcha code
                ngModel.$setValidity('incorrectCaptcha', true);
              } else {
                // incorrect captcha code
                ngModel.$setValidity('incorrectCaptcha', false);
                captcha.reloadImage();
              }
            });
        });
      }
    };
  }

  /**
   * Captcha client-side instance exposes Captcha workflow functions and values.
   */
  function captchaService($rootScope, $http) {
    var Captcha = function() {
      if (typeof BotDetect === 'undefined') {
        throw new Error('Can not create Captcha instance, please put "new Captcha()" inside function that will be invoked after form is submitted.');
      }

      this.captchaStyleName = $rootScope.captchaStyleName;
      this.captchaId = Captcha.getBotDetectInstance().captchaId;
    };

    Captcha.getBotDetectInstance = function() {
      if (!$rootScope.captchaStyleName) {
        return null;
      }
      return BotDetect.getInstanceByStyleName($rootScope.captchaStyleName);
    };

    Captcha.prototype.validate = function(captchaCode) {
      var promise = $http({
          method: 'GET',
          url: Captcha.getBotDetectInstance().validationUrl,
          params: {
            i: captchaCode
          }
        })
          .then(function(response) {
            return response.data;
          }, function(error) {
            return error.data;
          });

      return promise;
    };

    Captcha.prototype.reloadImage = function() {
      Captcha.getBotDetectInstance().reloadImage();
    };

    return Captcha;
  }

  angular
    .module('BotDetectCaptcha', [])
    .provider('captchaSettings', captchaSettings)
    .filter('captchaEndpointFilter', captchaEndpointFilter)
    .factory('captchaHelper', [
      '$window',
      captchaHelper
    ])
    .factory('Captcha', [
      '$rootScope',
      '$http',
      captchaService
    ])
    .directive('botdetectCaptcha', [
      '$document',
      '$rootScope',
      '$http',
      '$filter',
      'captchaSettings',
      'captchaHelper',
      botdetectCaptchaDirective
    ])
    .directive('correctCaptcha', [
      'Captcha',
      correctCaptchaDirective
    ]);

})(window.angular);
