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
          baseUrl: '',
          handlerPath: ''
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
  function captchaBaseUrlFilter() {
    return function(url) {
      return url.replace(/\/+$/g, '');
    };
  }
  
  /**
   * Strip '/' from the beginning and end, 
   * then add '/' to the beginning of the given path.
   */
  function captchaHandlerPathFilter() {
    return function(path) {
      var canonical = path.replace(/^\/+|\/+$/g, '');
          canonical = '/' + canonical;
        return canonical;
    };
  }
  
  /**
   * Captcha helpers that provides useful functions.
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
        var baseUrl,
            styleName,
            handlerUrl,
            bodyElement,
            handlerPath,
            scriptIncludeUrl,
            initScriptInclude,
            initScriptIncludeUrl,

        styleName = !attrs.stylename ? 'defaultCaptcha' : attrs.stylename;

        // save styleName in $rootScope, that will be used in correctCaptcha directive and Captcha service for getting BotDetect instance
        $rootScope.captchaStyleName = styleName;

        // normalize base url and handler path
        baseUrl = $filter('captchaBaseUrlFilter')(captchaHelper.trim(captchaSettings.baseUrl));
        handlerPath = $filter('captchaHandlerPathFilter')(captchaHelper.trim(captchaSettings.handlerPath));

        // build captcha handler url
        handlerUrl = baseUrl + handlerPath;

        // build BotDetect client-side script include url
        scriptIncludeUrl = captchaHelper.buildUrl(handlerUrl, {
          get: 'script-include'
        });

        // body element
        bodyElement = $document.find('body')[0];

        $http({
          method: 'GET',
          url: handlerUrl,
          params: {
            get: 'html',
            c: styleName
          },
          beforeSend: function() {
            // append BotDetect client-side script to body once
            if (0 === $document[0].getElementsByClassName('BDC_ScriptInclude').length) {
              bodyElement.append(captchaHelper.scriptInclude(scriptIncludeUrl, 'BDC_ScriptInclude'));
            }

            // remove included BotDetect init script if it exists
            initScriptInclude = $document[0].getElementsByClassName('BDC_InitScriptInclude');
            if (0 !== initScriptInclude.length) {
              initScriptInclude[0].remove();
            }
          }
        })
          .then(function(response) {
            // show captcha html
            element.html(response.data);

            // remove all botdetect script includes (script include and init script include)
            // since angular doesn't execute script in default 
            element.find('script').remove();

            // build BotDetect init script include url
            initScriptIncludeUrl = captchaHelper.buildUrl(handlerUrl, {
              get: 'init-script-include',
              c: styleName,
              t: element[0].querySelector('#BDC_VCID_' + styleName).value
            });

            // append BotDetect init script to body
            bodyElement.append(captchaHelper.scriptInclude(initScriptIncludeUrl, 'BDC_InitScriptInclude'));
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
        
        ngModel.$setValidity('correctCaptcha', false);
        
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
                ngModel.$setValidity('correctCaptcha', true);
              } else {
                // incorrect captcha code
                ngModel.$setValidity('correctCaptcha', false);
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
    
    Captcha.bodetectInstance = null;
    
    Captcha.getBotDetectInstance = function() {
      if (!$rootScope.captchaStyleName) {
        return null;
      }
      
      if (!Captcha.bodetectInstance
          || (Captcha.bodetectInstance.captchaStyleName !== $rootScope.captchaStyleName)) {
        Captcha.bodetectInstance = BotDetect.getInstanceByStyleName($rootScope.captchaStyleName);
      }
      
      return Captcha.bodetectInstance;
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
    .filter('captchaBaseUrlFilter', captchaBaseUrlFilter)
    .filter('captchaHandlerPathFilter', captchaHandlerPathFilter)
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
