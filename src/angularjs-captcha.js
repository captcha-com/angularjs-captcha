/* BotDetect AngularJS CAPTCHA Module */

(function(angular) {
  'use strict';

  function config($httpProvider) {
    $httpProvider.interceptors.push('captchaHttpInterceptor'); 
  }

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
      scriptInclude: function(url, className) {
        var script = $window.document.createElement('script');
            script.src = url;
            script.className = className;
        return script;
      }
    };
  }
  
  /**
   * Register beforeSend() function for Http request.
   */
  function captchaHttpInterceptor() {
    return {
      request: function(config) {
        if (config.beforeSend) {
          config.beforeSend();
        }
        return config;
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

        $http({
          method: 'GET',
          url: captchaEndpoint,
          params: {
            get: 'html',
            c: styleName
          },
          beforeSend: function() {
            // append BotDetect client-side script to body once
            if ($document[0].getElementsByClassName('BDC_ScriptInclude').length === 0) {
              // build BotDetect client-side script include url
              var scriptIncludeUrl = captchaHelper.buildUrl(captchaEndpoint, {
                get: 'script-include'
              });
              angular.element(bodyElement).append(captchaHelper.scriptInclude(scriptIncludeUrl, 'BDC_ScriptInclude'));
            }

            // remove included BotDetect init script if it exists
            var initScriptIncluded = $document[0].getElementsByClassName('BDC_InitScriptInclude');
            if (initScriptIncluded.length !== 0) {
              initScriptIncluded[0].parentNode.removeChild(initScriptIncluded[0]);
            }
          }
        })
          .then(function(response) {
            // remove all botdetect script includes (script include and init script include)
            // because angular won't execute them in default.
            var captchaHtmlWithoutScripts = response.data.replace(/<script.*<\/script>/g, '');

            // show captcha html in view
            element.html(captchaHtmlWithoutScripts);

            // build BotDetect init script include url
            var initScriptIncludeUrl = captchaHelper.buildUrl(captchaEndpoint, {
              get: 'init-script-include',
              c: styleName,
              t: element[0].querySelector('#BDC_VCID_' + styleName).value,
              cs: '200'
            });

            // append BotDetect init script to body
            angular.element(bodyElement).append(captchaHelper.scriptInclude(initScriptIncludeUrl, 'BDC_InitScriptInclude'));
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
    .config([
      '$httpProvider',
      config
    ])
    .provider('captchaSettings', captchaSettings)
    .filter('captchaEndpointFilter', captchaEndpointFilter)
    .factory('captchaHelper', [
      '$window',
      captchaHelper
    ])
    .factory('captchaHttpInterceptor', captchaHttpInterceptor)
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
