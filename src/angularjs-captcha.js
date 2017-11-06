/* BotDetect CAPTCHA AngularJS Module */

(function(angular) {
  'use strict';

  // BotDetect Captcha module settings.
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
        // normalize captcha endpoint path
        captchaSettings.captchaEndpoint = captchaSettings.captchaEndpoint.replace(/\/+$/g, '');
        return captchaSettings;
      }
    };
  }

  // Captcha helper that provides useful functions.
  function captchaHelper($http, $rootScope, captchaSettings) {
    return {
      getScript: function(url, onLoadSuccess) {
        $http({
          method: 'GET',
          url: url
        })
          .then(function(response) {
            var f = new Function(response.data); f();
            if (typeof onLoadSuccess === 'function') {
              onLoadSuccess();
            }
          }, function(error) {
            throw new Error(error.data);
          });
      },
      
      loadScriptIncludes: function(element) {
        var scriptIncludeUrl = captchaSettings.captchaEndpoint + '?get=script-include';
        var self = this;
        this.getScript(scriptIncludeUrl, function() {
          var captchaId = element[0].querySelector('#BDC_VCID_' + $rootScope.captchaStyleName).value;
          var initScriptIncludeUrl = captchaSettings.captchaEndpoint + '?get=init-script-include&c=' + $rootScope.captchaStyleName + '&t=' + captchaId + '&cs=200';
          self.getScript(initScriptIncludeUrl);
        });
      }
    };
  }
  
  // <botdetect-captcha> directive element, which is used to display Captcha html markup.
  function botdetectCaptchaDirective($rootScope, $http, captchaSettings, captchaHelper) {
    return {
      restrict: 'E',
      link: function(scope, element, attrs) {
        var styleName = attrs.stylename ? attrs.stylename : 'defaultCaptcha';

        // save styleName in $rootScope, that will be used in correctCaptcha directive and Captcha service for getting BotDetect instance
        $rootScope.captchaStyleName = styleName;

        $http({
          method: 'GET',
          url: captchaSettings.captchaEndpoint,
          params: {
            get: 'html',
            c: styleName
          }
        })
          .then(function(response) {
            // show captcha html in view
            element.html(response.data.replace(/<script.*<\/script>/g, ''));
            
            // load botdetect scripts
            captchaHelper.loadScriptIncludes(element);
          }, function(error) {
            throw new Error(error.data);
          });
      }
    };
  }

  // 'correct-captcha' directive attribute, which is used to perform ui captcha validaion.
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

  // Captcha client-side instance exposes Captcha workflow functions and values.
  function captchaService($rootScope, $http) {
    var Captcha = function() {
      if (window.botdetect === undefined) {
        throw new Error('Can not create Captcha instance, please put "new Captcha()" inside function that will be invoked after form is submitted.');
      }

      this.captchaStyleName = $rootScope.captchaStyleName;
      this.captchaId = Captcha.getInstance().captchaId;
    };

    Captcha.getInstance = function() {
      return $rootScope.captchaStyleName
        ? window.botdetect.getInstanceByStyleName($rootScope.captchaStyleName)
        : null;
    };

    Captcha.prototype.validate = function(captchaCode) {
      var promise = $http({
          method: 'GET',
          url: Captcha.getInstance().validationUrl,
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
      Captcha.getInstance().reloadImage();
    };

    return Captcha;
  }

  angular
    .module('BotDetectCaptcha', [])
    .provider('captchaSettings', captchaSettings)
    .factory('captchaHelper', [
      '$http',
      '$rootScope',
      'captchaSettings',
      captchaHelper
    ])
    .factory('Captcha', [
      '$rootScope',
      '$http',
      captchaService
    ])
    .directive('botdetectCaptcha', [
      '$rootScope',
      '$http',
      'captchaSettings',
      'captchaHelper',
      botdetectCaptchaDirective
    ])
    .directive('correctCaptcha', [
      'Captcha',
      correctCaptchaDirective
    ]);

})(window.angular);
