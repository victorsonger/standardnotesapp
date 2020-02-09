import template from '%/directives/component-view.pug';
import { isDesktopApplication } from '../../utils';
/**
 * The maximum amount of time we'll wait for a component
 * to load before displaying error
 */
const MAX_LOAD_THRESHOLD = 4000;

const VISIBILITY_CHANGE_LISTENER_KEY = 'visibilitychange';

class ComponentViewCtrl {
  /* @ngInject */
  constructor(
    $scope,
    $rootScope,
    $timeout,
    application,
    desktopManager,
    themeManager
  ) {
    this.$rootScope = $rootScope;
    this.$timeout = $timeout;
    this.application = application;
    this.themeManager = themeManager;
    this.desktopManager = desktopManager;
    this.componentValid = true;

    $scope.$watch('ctrl.component', (component, prevComponent) => {
      this.componentValueDidSet(component, prevComponent);
    });
    $scope.$on('ext-reload-complete', () => {
      this.reloadStatus(false);
    });
    $scope.$on('$destroy', () => {
      this.destroy();
    });
  }

  $onInit() {
    this.registerComponentHandlers();
    this.registerPackageUpdateObserver();
  };

  registerPackageUpdateObserver() {
    this.updateObserver = this.desktopManager
    .registerUpdateObserver((component) => {
      if(component === this.component && component.active) {
        this.reloadComponent();
      }
    });
  }

  registerComponentHandlers() {
    this.themeHandlerIdentifier = 'component-view-' + Math.random();
    this.application.componentManager.registerHandler({
      identifier: this.themeHandlerIdentifier,
      areas: ['themes'],
      activationHandler: (component) => {

      }
    });

    this.identifier = 'component-view-' + Math.random();
    this.application.componentManager.registerHandler({
      identifier: this.identifier,
      areas: [this.component.area],
      activationHandler: (component) => {
        if(component !== this.component) {
          return;
        }
        this.$timeout(() => {
          this.handleActivation();
        });
      },
      actionHandler: (component, action, data) => {
        if(action === 'set-size') {
          this.application.componentManager.handleSetSizeEvent(component, data);
        }
      }
    });
  }

  onVisibilityChange() {
    if(document.visibilityState === 'hidden') {
      return;
    }
    if(this.issueLoading) {
      this.reloadComponent();
    }
  }

  async reloadComponent() {
    this.componentValid = false;
    await this.application.componentManager.reloadComponent(this.component);
    this.reloadStatus();
  }

  reloadStatus(doManualReload = true) {
    this.reloading = true;
    const component = this.component;
    const previouslyValid = this.componentValid;
    const offlineRestricted = component.offlineOnly && !isDesktopApplication();
    const hasUrlError = function(){
      if(isDesktopApplication()) {
        return !component.local_url && !component.hasValidHostedUrl();
      } else {
        return !component.hasValidHostedUrl();
      }
    }();
    this.expired = component.valid_until && component.valid_until <= new Date();
    if(!component.lockReadonly) {
      component.readonly = this.expired;
    }
    this.componentValid = !offlineRestricted && !hasUrlError;
    if(!this.componentValid) {
      this.loading = false;
    }
    if(offlineRestricted) {
      this.error = 'offline-restricted';
    } else if(hasUrlError) {
      this.error = 'url-missing';
    } else {
      this.error = null;
    }
    if(this.componentValid !== previouslyValid) {
      if(this.componentValid) {
        this.application.componentManager.reloadComponent(component, true);
      }
    }
    if(this.expired && doManualReload) {
      this.$rootScope.$broadcast('reload-ext-dat');
    }

    this.$timeout(() => {
      this.reloading = false;
    }, 500);
  }

  handleActivation() {
    if(!this.component.active) {
      return;
    }
    const iframe = this.application.componentManager.iframeForComponent(
      this.component
    );
    if(!iframe) {
      return;
    }
    this.loading = true;
    if(this.loadTimeout) {
      this.$timeout.cancel(this.loadTimeout);
    }
    this.loadTimeout = this.$timeout(() => {
      this.handleIframeLoadTimeout();
    }, MAX_LOAD_THRESHOLD);

    iframe.onload = (event) => {
      this.handleIframeLoad(iframe);
    };
  }

  async handleIframeLoadTimeout() {
    if(this.loading) {
      this.loading = false;
      this.issueLoading = true;
      if(!this.didAttemptReload) {
        this.didAttemptReload = true;
        this.reloadComponent();
      } else {
        document.addEventListener(
          VISIBILITY_CHANGE_LISTENER_KEY,
          this.onVisibilityChange.bind(this)
        );
      }
    }
  }

  async handleIframeLoad(iframe) {
    let desktopError = false;
    if(isDesktopApplication()) {
      try {
        /** Accessing iframe.contentWindow.origin only allowed in desktop app. */
        if(!iframe.contentWindow.origin || iframe.contentWindow.origin === 'null') {
          desktopError = true;
        }
      } catch (e) {}
    }
    this.$timeout.cancel(this.loadTimeout);
    await this.application.componentManager.registerComponentWindow(
      this.component,
      iframe.contentWindow
    );
    const avoidFlickerTimeout = 7;
    this.$timeout(() => {
      this.loading = false;
      // eslint-disable-next-line no-unneeded-ternary
      this.issueLoading = desktopError ? true : false;
      this.onLoad && this.onLoad(this.component);
    }, avoidFlickerTimeout);
  }

  componentValueDidSet(component, prevComponent) {
    const dontSync = true;
    if(prevComponent && component !== prevComponent) {
      this.application.componentManager.deactivateComponent(
        prevComponent,
        dontSync
      );
    }
    if(component) {
      this.application.componentManager.activateComponent(
        component,
        dontSync
      );
      this.reloadStatus();
    }
  }

  disableActiveTheme() {
    this.themeManager.deactivateAllThemes();
  }

  getUrl() {
    const url = this.application.componentManager.urlForComponent(this.component);
    this.component.runningLocally = (url === this.component.local_url);
    return url;
  }

  destroy() {
    this.application.componentManager.deregisterHandler(this.themeHandlerIdentifier);
    this.application.componentManager.deregisterHandler(this.identifier);
    if(this.component && !this.manualDealloc) {
      const dontSync = true;
      this.application.componentManager.deactivateComponent(this.component, dontSync);
    }

    this.desktopManager.deregisterUpdateObserver(this.updateObserver);
    document.removeEventListener(
      VISIBILITY_CHANGE_LISTENER_KEY,
      this.onVisibilityChange.bind(this)
    );
  }
}

export class ComponentView {
  constructor() {
    this.restrict = 'E';
    this.template = template;
    this.scope = {
      component: '=',
      onLoad: '=?',
      manualDealloc: '=?'
    };
    this.controller = ComponentViewCtrl;
    this.controllerAs = 'ctrl';
    this.bindToController = true;
  }
}
