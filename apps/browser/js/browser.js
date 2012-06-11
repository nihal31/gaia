'use strict';

var Browser = {

  currentTab: null,
  tabCounter: 0,
  tabs: {},

  styleSheet: document.styleSheets[0],
  cssTranslateId: null,

  GO: 0,
  REFRESH: 1,
  STOP: 2,

  previousScreen: null,
  currentScreen: null,
  PAGE_SCREEN: 'page-screen',
  TABS_SCREEN: 'tabs-screen',
  AWESOME_SCREEN: 'awesome-screen',

  urlButtonMode: null,

  init: function browser_init() {
    // Assign UI elements to variables
    this.toolbarStart = document.getElementById('toolbar-start');
    this.urlBar = document.getElementById('url-bar');
    this.urlInput = document.getElementById('url-input');
    this.urlButton = document.getElementById('url-button');
    this.content = document.getElementById('browser-content');
    this.awesomescreen = document.getElementById('awesomescreen');
    this.history = document.getElementById('history-list');
    this.backButton = document.getElementById('back-button');
    this.forwardButton = document.getElementById('forward-button');

    this.tabsBadge = document.getElementById('tabs-badge');
    this.throbber = document.getElementById('throbber');
    this.frames = document.getElementById('frames');
    this.tabsList = document.getElementById('tabs-list');
    this.mainScreen = document.getElementById('main-screen');

    // Add event listeners
    window.addEventListener('submit', this);
    window.addEventListener('keyup', this, true);
    window.addEventListener('resize', this.handleWindowResize.bind(this));

    this.backButton.addEventListener('click', this.goBack.bind(this));
    this.urlButton.addEventListener('click', this.go.bind(this));
    this.forwardButton.addEventListener('click', this.goForward.bind(this));
    this.urlInput.addEventListener('focus', this.urlFocus.bind(this));
    this.urlInput.addEventListener('blur', this.urlBlur.bind(this));
    this.history.addEventListener('click', this.followLink.bind(this));
    this.tabsBadge.addEventListener('click',
      this.handleTabsBadgeClicked.bind(this));
    this.tabsList.addEventListener('click',
      this.handleTabClicked.bind(this));
    this.mainScreen.addEventListener('click',
      this.handlePageScreenClicked.bind(this));

    this.handleWindowResize();

    // Load homepage once GlobalHistory is initialised
    // (currently homepage is blank)
    GlobalHistory.init((function() {
      this.selectTab(this.createTab());
      this.showPageScreen();
    }).bind(this));
  },

  // Clicking the page preview on the left gutter of the tab page opens
  // that page
  handlePageScreenClicked: function browser_handlePageScreenClicked(e) {
    if (this.currentScreen === this.TABS_SCREEN) {
      this.showPageScreen();
    }
  },

  // We want to ensure the current page preview on the tabs screen is in
  // a consistently sized gutter on the left
  handleWindowResize: function browser_handleWindowResize() {
    var translate = 'translateX(-' + (window.innerWidth - 50) + 'px)';
    if (!this.cssTranslateId) {
      var css = '.tabs-screen #main-screen { -moz-transform: ' +
        translate + ';}';
      var insertId = this.styleSheet.cssRules.length - 1;
      this.cssTranslateId = this.styleSheet.insertRule(css, insertId);
    } else {
      var rule = this.styleSheet.cssRules[this.cssTranslateId];
      rule.style.MozTransform = translate;
    }
  },

  // Tabs badge is the button at the top left, used to show the number of tabs
  // and to create new ones
  handleTabsBadgeClicked: function browser_handleTabsBadgeClicked() {
    if (this.currentScreen === this.TABS_SCREEN) {
      var tabId = this.createTab();
      this.selectTab(tabId);
      this.showAwesomeScreen();
      return;
    }
    if (this.currentScreen === this.AWESOME_SCREEN &&
        this.previousScreen === this.PAGE_SCREEN) {
      this.showPageScreen();
      return;
    }
    this.showTabScreen();
  },

  handleTabClicked: function browser_handleTabClicked(e) {
    var id = e.target.getAttribute('data-id');
    if (!id) {
      return;
    }
    if (e.target.nodeName === 'BUTTON') {
      var tabs = Object.keys(this.tabs);
      if (tabs.length > 1) {
        // The tab to be selected when the current one is deleted
        var newTab = tabs.indexOf(id);
        if (newTab === tabs.length - 1) {
          newTab -= 1;
        }
        this.deleteTab(id);
        this.selectTab(Object.keys(this.tabs)[newTab]);
        this.showTabScreen();
      }
    } else if (e.target.nodeName === 'A') {
      this.selectTab(id);
      this.showPageScreen();
    }
  },

  // Each browser gets their own listener
  handleBrowserEvent: function browser_handleBrowserEvent(tab) {
    return (function(evt) {

      var isCurrentTab = this.currentTab.id === tab.id;
      switch (evt.type) {

      case 'mozbrowserloadstart':
        // iframe will call loadstart on creation, ignore
        if (!tab.url) {
          return;
        }
        tab.loading = true;
        if (isCurrentTab) {
          this.throbber.classList.add('loading');
          this.setUrlButtonMode(this.STOP);
        }
        tab.title = null;
        tab.iconUrl = null;
        break;

      case 'mozbrowserloadend':
        if (!tab.loading) {
          return;
        }
        tab.loading = false;
        if (isCurrentTab) {
          this.throbber.classList.remove('loading');
          this.urlInput.value = tab.title;
          this.setUrlButtonMode(this.REFRESH);
        }

        // We capture screenshots for everything when loading is
        // completed, but set background tabs inactive
        if (tab.dom.getScreenshot) {
          tab.dom.getScreenshot().onsuccess = function(e) {
            tab.screenshot = e.target.result;
            if (!isCurrentTab) {
              tab.dom.setActive(false);
            }
          }
        }
        break;

      case 'mozbrowserlocationchange':
        tab.url = evt.detail;
        this.updateHistory(evt.detail);
        if (isCurrentTab) {
          this.urlInput.value = tab.url;
        }
        break;

      case 'mozbrowsertitlechange':
        if (evt.detail) {
          tab.title = evt.detail;
          GlobalHistory.setPageTitle(tab.url, tab.title);
          if (isCurrentTab && !tab.loading) {
            this.urlInput.value = tab.title;
          }
          // Refresh the tab screen if we are currently viewing it, for dynamic
          // or not yet loaded titles
          if (this.currentScreen === this.TABS_SCREEN) {
            this.showTabScreen();
          }
        }
        break;

      case 'mozbrowsericonchange':
        if (evt.detail && evt.detail != tab.iconUrl) {
          tab.iconUrl = evt.detail;
          this.getIcon(tab.iconUrl, function(icon) {
            GlobalHistory.setPageIcon(tab.url, icon);
          });
        }
        break;

      case 'mozbrowsercontextmenu':
        this.showContextMenu(evt);
        break;
      }
    }).bind(this);
  },

  handleEvent: function browser_handleEvent(evt) {
    var urlInput = this.urlInput;
    switch (evt.type) {
      case 'submit':
          this.go(evt);
        break;

      case 'keyup':
        if (!this.currentTab || !this.currentTab.session.backLength() ||
          evt.keyCode != evt.DOM_VK_ESCAPE)
          break;

        this.goBack();
        evt.preventDefault();
        break;
    }
  },

  getIcon: function browser_getIcon(iconUrl, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', iconUrl, true);
    xhr.responseType = 'blob';
    xhr.addEventListener('load', function() {
      if (xhr.status === 200) {
        var blob = xhr.response;
        callback(blob);
      }
    }, false);
    xhr.send();
  },

  navigate: function browser_navigate(url) {
    this.showPageScreen();
    this.currentTab.title = null;
    this.currentTab.url = url;
    this.currentTab.dom.setAttribute('src', url);
    this.urlInput.value = url;
  },

  go: function browser_go(e) {
    if (e) {
      e.preventDefault();
    }

    if (this.urlButtonMode == this.REFRESH) {
      this.navigate(this.currentTab.url);
      return;
    }

    var url = this.urlInput.value.trim();
    var protocolRegexp = /^([a-z]+:)(\/\/)?/i;
    var protocol = protocolRegexp.exec(url);
    if (!protocol) {
      url = 'http://' + url;
    }

    if (url != this.currentTab.url) {
      this.urlInput.value = url;
      this.currentTab.url = url;
    }
    this.navigate(url);
    this.urlInput.blur();
  },

  goBack: function browser_goBack() {
    this.currentTab.session.back();
    this.refreshButtons();
  },

  goForward: function browser_goForward() {
    this.currentTab.session.forward();
    this.refreshButtons();
  },

  refreshButtons: function() {
    this.backButton.disabled = !this.currentTab.session.backLength();
    this.forwardButton.disabled = !this.currentTab.session.forwardLength();
  },

  updateHistory: function browser_updateHistory(url) {
    this.currentTab.session.pushState(null, '', url);
    GlobalHistory.addVisit(url);
    this.refreshButtons();
  },

  urlFocus: function browser_urlFocus() {
    if (this.currentScreen === this.PAGE_SCREEN) {
      this.urlInput.value = this.currentTab.url;
      this.urlInput.select();
      GlobalHistory.getHistory(this.showGlobalHistory.bind(this));
      this.showAwesomeScreen();
    }
  },

  urlBlur: function browser_urlBlur() {
    this.urlInput.value = this.currentTab.title || this.currentTab.url;
  },

  setUrlButtonMode: function browser_setUrlButtonMode(mode) {
    this.urlButtonMode = mode;
    switch (mode) {
      case this.GO:
        this.urlButton.src = 'style/images/go.png';
        this.urlButton.style.display = 'block';
        break;
      case this.REFRESH:
        this.urlButton.src = 'style/images/refresh.png';
        this.urlButton.style.display = 'block';
        break;
      case this.STOP:
        // Dont currently have a stop button
        this.urlButton.style.display = 'none';
        break;
    }
  },

  showGlobalHistory: function browser_showGlobalHistory(visits) {
    var history = this.history;
    history.innerHTML = '';
    visits.forEach(function browser_populateHistory(visit) {
      var li = document.createElement('li');
      li.innerHTML = '<a href="' + visit.uri + '"><span>' +
        (visit.title ? visit.title : visit.uri) +
        '</span><small>' + visit.uri + '</small></a>';
      history.appendChild(li);
    });
  },

  openInNewTab: function(url) {
    this.createTab(url);
    this.tabsBadge.innerHTML = Object.keys(this.tabs).length;
  },

  showContextMenu: function browser_showContextMenu(evt) {

    var ctxDefaults = {
      'A' : {
        'open_in_tab': {
          src: 'default',
          label: 'Open link in New Tab',
          selected: this.openInNewTab.bind(this)
        }
      }
    };

    var menuItems = ctxDefaults[evt.detail.nodeName] || {};

    var collectMenuItems = function(menu) {
      for(var i in menu.items) {
        if (menu.items[i].type === 'menuitem') {
          var id = menu.items[i].id;;
          menuItems[id] = menu.items[i];
          menuItems[id].src = 'user';
        } else if (menu.items[i].type === 'menu') {
          collectMenuItems(menu.items[i]);
        }
      }
    }

    var menuData = evt.detail;
    var cover = document.createElement('div');
    var menu = document.createElement('ul');

    if (menuData.menu) {
      collectMenuItems(menuData.menu);
    }

    if (Object.keys(menuItems).length === 0) {
      return;
    }

    for (var i in menuItems) {
      var text = document.createTextNode(menuItems[i].label);
      var li = document.createElement('li');
      li.setAttribute('data-menusource', menuItems[i].src);
      li.setAttribute('data-id', i);

      if (menuItems[i].icon) {
        var img = document.createElement('img');
        img.setAttribute('src', menuItems[i].icon);
        li.appendChild(img);
      }

      li.appendChild(text);
      menu.appendChild(li);
    }

    cover.setAttribute('id', 'cover');
    cover.appendChild(menu);

    menu.addEventListener('click', function(e) {
      if (e.target.nodeName !== 'LI') {
        return;
      }
      e.stopPropagation();
      var id = e.target.getAttribute('data-id');
      var src = e.target.getAttribute('data-menusource');
      if (src === 'user') {
        evt.detail.contextMenuItemSelected(id);
      } else if (src === 'default') {
        menuItems[id].selected(menuData.href);
      }
      document.body.removeChild(cover);
    });

    cover.addEventListener('click', function() {
      document.body.removeChild(cover);
    });

    document.body.appendChild(cover);
  },

  followLink: function browser_followLink(e) {
    e.preventDefault();
    this.navigate(e.target.getAttribute('href'));
  },

  createTab: function browser_createTab(url) {
    var iframe = document.createElement('iframe');
    var browserEvents = ['loadstart', 'loadend', 'locationchange',
                         'titlechange', 'iconchange', 'contextmenu'];
    iframe.mozbrowser = true;
    // FIXME: content shouldn't control this directly
    iframe.setAttribute('remote', 'true');
    iframe.style.top = '-999px';
    if (url) {
      iframe.setAttribute('src', url);
    }

    var tab = {
      id: 'tab_' + this.tabCounter++,
      dom: iframe,
      url: url || null,
      title: null,
      loading: false,
      session: new SessionHistory(),
      screenshot: null
    };

    if (!iframe.setActive) {
      iframe.setActive = function(active) {
        iframe.style.display = active ? 'block' : 'none';
      }
    }

    browserEvents.forEach((function attachBrowserEvent(type) {
      iframe.addEventListener('mozbrowser' +
        type, this.handleBrowserEvent(tab));
    }).bind(this));

    this.tabs[tab.id] = tab;
    this.frames.appendChild(iframe);

    return tab.id;
  },

  deleteTab: function browser_deleteTab(id) {
    this.tabs[id].dom.parentNode.removeChild(this.tabs[id].dom);
    delete this.tabs[id];
    if (this.currentTab.id === id) {
      this.currentTab = null;
    }
  },

  hideCurrentTab: function browser_hideCurrentTab() {
    var tab = this.currentTab;
    tab.dom.setActive(false);
    this.throbber.classList.remove('loading');
    this.currentTab = null;
  },

  selectTab: function browser_selectTab(id) {
    if (this.currentTab !== null && this.currentTab.id !== id) {
      this.hideCurrentTab();
    }

    this.currentTab = this.tabs[id];
    this.currentTab.dom.setActive(true);
    // We may have picked a currently loading background tab
    // that was positioned off screen
    this.currentTab.dom.style.top = '0px';
    this.urlInput.value = this.currentTab.title;

    if (this.currentTab.loading) {
      this.throbber.classList.add('loading');
    }
    this.refreshButtons();
  },

  switchScreen: function(screen) {
    document.body.classList.remove(this.currentScreen);
    this.previousScreen = this.currentScreen;
    this.currentScreen = screen;
    document.body.classList.add(this.currentScreen);
  },

  showAwesomeScreen: function browser_showAwesomeScreen() {
    this.urlInput.focus();
    this.setUrlButtonMode(this.GO);
    this.tabsBadge.innerHTML = '×';
    this.switchScreen(this.AWESOME_SCREEN);
  },

  showPageScreen: function browser_showPageScreen() {
    this.switchScreen(this.PAGE_SCREEN);
    this.tabsBadge.innerHTML = Object.keys(this.tabs).length;
  },

  showTabScreen: function browser_showTabScreen() {
    this.tabsBadge.innerHTML = '+';
    this.urlInput.blur();

    var multipleTabs = Object.keys(this.tabs).length > 1;
    var ul = document.createElement('ul');

    for (var tab in this.tabs) {
      var title = this.tabs[tab].title || this.tabs[tab].url || 'New Tab';
      var a = document.createElement('a');
      var li = document.createElement('li');
      var span = document.createElement('span');
      var img = document.createElement('img');
      var text = document.createTextNode(title);

      if (multipleTabs) {
        var close = document.createElement('button');
        close.appendChild(document.createTextNode('✕'));
        close.classList.add('close');
        close.setAttribute('data-id', this.tabs[tab].id);
        li.appendChild(close);
      }

      a.setAttribute('data-id', this.tabs[tab].id);

      span.appendChild(text);
      a.appendChild(img);
      a.appendChild(span);
      li.appendChild(a);
      ul.appendChild(li);

      if (this.tabs[tab].screenshot) {
        img.setAttribute('src', this.tabs[tab].screenshot);
      }

      if (tab === this.currentTab.id) {
        li.classList.add('current');
      }

    }
    this.tabsList.innerHTML = '';
    this.tabsList.appendChild(ul);
    this.switchScreen(this.TABS_SCREEN);
  }
};

window.addEventListener('load', function browserOnLoad(evt) {
  window.removeEventListener('load', browserOnLoad);
  Browser.init();
});
