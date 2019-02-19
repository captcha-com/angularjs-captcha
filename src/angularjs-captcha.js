/* BotDetect CAPTCHA AngularJS Module */

(function(angular) {
  'use strict';

  // BotDetect Captcha module settings.
  function captchaSettings() {
    var configuredSettings = {},
        captchaSettings = { 
          captchaEndpoint: '',
          captchaEnabled: true
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
      getScript: function(url) {
        $http({
          method: 'GET',
          url: url
        })
          .then(function(response) {
            var f = new Function(response.data); f();
          }, function(error) {
            throw new Error(error.data);
          });
      },

      // get captcha endpoint handler from configued captchaEndpoint value,
      // the result can be "simple-captcha-endpoint.ashx", "botdetectcaptcha",
      // or "simple-botdetect.php"
      getCaptchaEndpointHandler: function() {
        var splited = captchaSettings.captchaEndpoint.split('/');
        return splited[splited.length - 1];
      },

      // get backend base url from configued captchaEndpoint value
      getBackendBaseUrl: function(captchaEndpointHandler) {
        var lastIndex = captchaSettings.captchaEndpoint.lastIndexOf(captchaEndpointHandler);
        return captchaSettings.captchaEndpoint.substring(0, lastIndex);
      },

      // change relative to absolute urls in captcha html markup
      changeRelativeToAbsoluteUrls: function(originCaptchaHtml) {
        var captchaEndpointHandler = this.getCaptchaEndpointHandler();
        var backendUrl = this.getBackendBaseUrl(captchaEndpointHandler);

        originCaptchaHtml = originCaptchaHtml.replace(/<script.*<\/script>/g, '');
        var relativeUrls = originCaptchaHtml.match(/(src|href)=\"([^"]+)\"/g);
        
        var relativeUrl, relativeUrlPrefixPattern, absoluteUrl,
            changedCaptchaHtml = originCaptchaHtml;

        for (var i = 0; i < relativeUrls.length; i++) {
          relativeUrl = relativeUrls[i].slice(0, -1).replace(/src=\"|href=\"/, '');
          relativeUrlPrefixPattern = new RegExp(".*" + captchaEndpointHandler);
          absoluteUrl = relativeUrl.replace(relativeUrlPrefixPattern, backendUrl + captchaEndpointHandler);
          changedCaptchaHtml = changedCaptchaHtml.replace(relativeUrl, absoluteUrl);
        }

        return changedCaptchaHtml;
      },
      
      loadScriptIncludes: function(element) {
        var captchaId = element.querySelector('#BDC_VCID_' + $rootScope.captchaStyleName).value;
        var scriptIncludeUrl = captchaSettings.captchaEndpoint + '?get=script-include&c=' + $rootScope.captchaStyleName + '&t=' + captchaId + '&cs=200';
        this.getScript(scriptIncludeUrl);
      },

      useUserInputBlurValidation: function(userInput) {
        return (userInput.getAttribute('correct-captcha') !== null);
      },

      validateUnsafe: function(captchaInstance, callback) {
        var captchaCode = captchaInstance.userInput;
        if (captchaCode.length !== 0) {
          $http({
            method: 'GET',
            url: captchaInstance.validationUrl,
            params: {
              i: captchaCode.value
            }
          })
            .then(function(response) {
              var isHuman = response.data;
              callback(isHuman);
            }, function(error) {
              throw new Error(error.data);
            });
        } else {
          var isHuman = false;
          callback(isHuman);
        }
      },

      getHtml: function(styleName, callback) {
        $http({
          method: 'GET',
          url: captchaSettings.captchaEndpoint,
          params: {
            get: 'html',
            c: styleName
          }
        })
          .then(function(response) {
            var captchaHtml = response.data;
            callback(captchaHtml);
          }, function(error) {
            throw new Error(error.data);
          });
      }
    };
  }
  
  // <botdetect-captcha> directive element, which is used to display Captcha html markup.
  function botdetectCaptchaDirective($rootScope, captchaSettings, captchaHelper) {
    return {
      restrict: 'E',
      link: function(scope, element, attrs) {
        if (!captchaSettings.captchaEnabled) {
          return;
        }

        var captchaStyleName = (function() {
          var styleName;

          styleName = attrs.captchastylename;
          if (styleName) {
            return styleName;
          }

          // backward compatibility
          styleName = attrs.stylename;
          if (styleName) {
            return styleName;
          }

          throw new Error('The captchaStyleName attribute is not found or its value is not set.');
        })();
        
        // save captchaStyleName in $rootScope, that will be used in correctCaptcha directive and Captcha service for getting BotDetect instance
        $rootScope.captchaStyleName = captchaStyleName;

        captchaHelper.getHtml(captchaStyleName, function(captchaHtml) {
          // show captcha html in view
          captchaHtml = captchaHelper.changeRelativeToAbsoluteUrls(captchaHtml);
          element.html(captchaHtml);

          // load botdetect scripts
          captchaHelper.loadScriptIncludes(element[0]);
        });
      }
    };
  }

  // 'correct-captcha' directive attribute, which is used to perform ui captcha validaion.
  function correctCaptchaDirective(Captcha, captchaHelper) {
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

          if (captchaCode.length === 0) {
            return;
          }

          captcha = new Captcha();

          captchaHelper.validateUnsafe(captcha, function(isHuman) {
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
  function captchaService($document, $rootScope, captchaHelper) {
    var Captcha = function() {
      if (window.botdetect === undefined) {
        throw new Error('Can not create Captcha instance, please put "new Captcha()" inside function that will be invoked after form is submitted.');
      }

      var instance = Captcha.getInstance();

      this.captchaStyleName = $rootScope.captchaStyleName;
      this.captchaId = instance.captchaId;
      this.userInput = instance.userInput;
      this.validationUrl = instance.validationUrl;
    };

    Captcha.getInstance = function() {
      return $rootScope.captchaStyleName
        ? window.botdetect.getInstanceByStyleName($rootScope.captchaStyleName)
        : null;
    };

    Captcha.prototype.getCaptchaId = function() {
      return this.captchaId;
    };

    Captcha.prototype.getUserEnteredCaptchaCode = function() {
      return this.userInput.value;
    };

    Captcha.prototype.validateUnsafe = function(callback) {
      var self = this;
      captchaHelper.validateUnsafe(this, function(isHuman) {
        callback(isHuman);
        if (!captchaHelper.useUserInputBlurValidation(self.userInput) && !isHuman) {
          self.reloadImage();
        }
      });
    };

    Captcha.prototype.reloadImage = function() {
      Captcha.getInstance().reloadImage();
    };

    Captcha.generateCaptchaMarkup = function(captchaStyleName) {
      // save captchaStyleName in $rootScope, it will be used in Captcha service for getting BotDetect instance
      $rootScope.captchaStyleName = captchaStyleName;

      captchaHelper.getHtml(captchaStyleName, function(captchaHtml) {
        var placeholder = $document[0].getElementsByTagName('botdetect-captcha');
        if (placeholder.length !== 0) {
          // show captcha html in view
          placeholder[0].innerHTML = captchaHtml;
          
          // load botdetect scripts
          captchaHelper.loadScriptIncludes(placeholder[0]);
        } else {
          throw new Error('<botdetect-captcha> directive element could not be found.');
        }
      });
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
      '$document',
      '$rootScope',
      'captchaHelper',
      captchaService
    ])
    .directive('botdetectCaptcha', [
      '$rootScope',
      'captchaSettings',
      'captchaHelper',
      botdetectCaptchaDirective
    ])
    .directive('correctCaptcha', [
      'Captcha',
      'captchaHelper',
      correctCaptchaDirective
    ]);

})(window.angular);
