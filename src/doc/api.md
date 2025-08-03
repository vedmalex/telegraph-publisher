---
title: Telegraph API
description: >-
  Telegra.ph is a minimalist publishing tool that allows you to create richly
  formatted posts and push them to the Web in just a click. Telegraph posts also
  get beautiful Instant View pages on Telegram.

  To maintain the purity of the basic interface, we launched the @Telegraph bot
  for those who require advanced features. This bot can help you manage your
  articles across any number of devices and get page view statistics for any
  Telegraph page.

  Anyone can enjoy the simplicity of Telegraph publishing, not just Telegram…
image: https://telegra.ph/file/6a5b15e7eb4d7329ca7af.jpg
---

# Telegraph API



![](./images/file_6a5b15e7eb4d7329ca7af.jpg)

**Telegra.ph** is a minimalist publishing tool that allows you to create richly formatted posts and push them to the Web in just a click. **Telegraph** posts also get beautiful [Instant View](https://telegram.org/blog/instant-view)  pages on **Telegram**.

To maintain the purity of the basic interface, we launched the [**@Telegraph**](https://telegram.me/telegraph)  **bot** for those who require advanced features. This bot can help you manage your articles across any number of devices and get page view statistics for any Telegraph page.

Anyone can enjoy the simplicity of Telegraph publishing, not just [Telegram](https://telegram.org/)  users. For this reason, all developers are welcome to use this **Telegraph API** to create bots like [@Telegraph](https://telegram.me/telegraph)  for any other platform, or even standalone interfaces.



All queries to the Telegraph API must be served over **HTTPS** and should be presented in this form: `https://api.telegra.ph/%method%`.

If a `path` parameter is present, you can also use this form: `https://api.telegra.ph/%method%/%path%`.

#### [1\. Methods](#Available-methods)

- [Telegraph API](#telegraph-api)
      - [1. Methods](#1-methods)
      - [2. Types](#2-types)
      - [3. Content format](#3-content-format)
    - [](#)
    - [Available methods](#available-methods)
      - [createAccount](#createaccount)
      - [editAccountInfo](#editaccountinfo)
      - [getAccountInfo](#getaccountinfo)
      - [revokeAccessToken](#revokeaccesstoken)
      - [createPage](#createpage)
      - [editPage](#editpage)
      - [getPage](#getpage)
      - [getPageList](#getpagelist)
      - [getViews](#getviews)
    - [Available types](#available-types)
      - [Account](#account)
      - [PageList](#pagelist)
      - [Page](#page)
      - [PageViews](#pageviews)
      - [Node](#node)
      - [NodeElement](#nodeelement)
    - [Content format](#content-format)

#### [2\. Types](#Available-types)

*   [Account](#Account)
*   [Node](#Node)
*   [NodeElement](#NodeElement)
*   [Page](#Page)
*   [PageList](#PageList)
*   [PageViews](#PageViews)

#### [3\. Content format](#Content-format)

###

### Available methods

We support **GET** and **POST** HTTP methods. The response contains a JSON object, which always has a Boolean field `ok`. If `ok` equals _true_, the request was successful, and the result of the query can be found in the `result` field. In case of an unsuccessful request, `ok` equals _false,_ and the error is explained in the `error` field (e.g. SHORT\_NAME\_REQUIRED). All queries must be made using UTF-8.

#### createAccount

Use this method to create a new Telegraph account. Most users only need one account, but this can be useful for channel administrators who would like to keep individual author names and profile links for each of their channels. On success, returns an [Account](#Account)  object with the regular fields and an additional `access_token` field.

*   **short\_name** (_String, 1-32 characters_)
    _Required_. Account name, helps users with several accounts remember which they are currently using. Displayed to the user above the "Edit/Publish" button on Telegra.ph, other users don't see this name.
*   **author\_name** (_String, 0-128 characters_)
    Default author name used when creating new articles.
*   **author\_url** (_String, 0-512 characters_)
    Default profile link, opened when users click on the author's name below the title. Can be any link, not necessarily to a Telegram profile or channel.

> **Sample request
> **[https://api.telegra.ph/createAccount?short\_name=Sandbox&author\_name=Anonymous](https://api.telegra.ph/createAccount?short_name=Sandbox&author_name=Anonymous)

#### editAccountInfo

Use this method to update information about a Telegraph account. Pass only the parameters that you want to edit. On success, returns an [Account](#Account)  object with the default fields.

*   **access\_token** (_String_)
    _Required_. Access token of the Telegraph account.
*   **short\_name** (_String, 1-32 characters_)
    New account name.
*   **author\_name** (_String, 0-128 characters_)
    New default author name used when creating new articles.
*   **author\_url** (_String, 0-512 characters_)
    New default profile link, opened when users click on the author's name below the title. Can be any link, not necessarily to a Telegram profile or channel.

> **Sample request
> **[https://api.telegra.ph/editAccountInfo?access\_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&short\_name=Sandbox&author\_name=Anonymous](https://api.telegra.ph/editAccountInfo?access_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&short_name=Sandbox&author_name=Anonymous)

#### getAccountInfo

Use this method to get information about a Telegraph account. Returns an [Account](#Account)  object on success.

*   **access\_token** (_String_)
    _Required_. Access token of the Telegraph account.
*   **fields** (_Array of String, default = \[“short\_name”,“author\_name”,“author\_url”\]_)
    List of account fields to return. Available fields: _short\_name_, _author\_name_, _author\_url_, _auth\_url_, _page\_count_.

> **Sample request
> **[https://api.telegra.ph/getAccountInfo?access\_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&fields=\["short\_name","page\_count"\]](https://api.telegra.ph/getAccountInfo?access_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&fields=[%22short_name%22,%22page_count%22])

#### revokeAccessToken

Use this method to revoke access\_token and generate a new one, for example, if the user would like to reset all connected sessions, or you have reasons to believe the token was compromised. On success, returns an [Account](#Account)  object with new `access_token` and `auth_url` fields.

*   **access\_token** (_String_)
    _Required_. Access token of the Telegraph account.

> **Sample request
> **[https://api.telegra.ph/revokeAccessToken?access\_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722](https://api.telegra.ph/revokeAccessToken?access_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722)

#### createPage

Use this method to create a new Telegraph page. On success, returns a [Page](#Page)  object.

*   **access\_token** (_String_)
    _Required_. Access token of the Telegraph account.
*   **title** (_String, 1-256 characters_)
    _Required_. Page title.
*   **author\_name** (_String, 0-128 characters_)Author name, displayed below the article's title.
*   **author\_url** (_String, 0-512 characters_)Profile link, opened when users click on the author's name below the title. Can be any link, not necessarily to a Telegram profile or channel.
*   **content** (_Array of_ [_Node_](#Node) _, up to 64 KB_)_Required_. [Content](#Content-format)  of the page.
*   **return\_content** (_Boolean, default = false_)
    If _true_, a `content` field will be returned in the [Page](#Page)  object (see: [Content format](#Content-format) ).

> **Sample request
> **[https://api.telegra.ph/createPage?access\_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&title=Sample+Page&author\_name=Anonymous&content=\[{"tag":"p","children":\["Hello,+world!"\]}\]&return\_content=true](https://api.telegra.ph/createPage?access_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&title=Sample+Page&author_name=Anonymous&content=[%7B%22tag%22:%22p%22,%22children%22:[%22Hello,+world!%22]%7D]&return_content=true)

#### editPage

Use this method to edit an existing Telegraph page. On success, returns a [Page](#Page)  object.

*   **access\_token** (_String_)
    _Required_. Access token of the Telegraph account.
*   **path** (_String_)
    _Required_. Path to the page.
*   **title** (_String, 1-256 characters_)
    _Required_. Page title.
*   **content** (_Array of_ [_Node_](#Node) _, up to 64 KB_)_Required_. [Content](#Content-format)  of the page.
*   **author\_name** (_String, 0-128 characters_)
    Author name, displayed below the article's title.
*   **author\_url** (_String, 0-512 characters_)
    Profile link, opened when users click on the author's name below the title. Can be any link, not necessarily to a Telegram profile or channel.
*   **return\_content** (_Boolean, default = false_)
    If _true_, a `content` field will be returned in the [Page](#Page)  object.

> **Sample request
> **[https://api.telegra.ph/editPage/Sample-Page-12-15?access\_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&title=Sample+Page&author\_name=Anonymous&content=\[{"tag":"p","children":\["Hello,+world!"\]}\]&return\_content=true](https://api.telegra.ph/editPage/Sample-Page-12-15?access_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&title=Sample+Page&author_name=Anonymous&content=[%7B%22tag%22:%22p%22,%22children%22:[%22Hello,+world!%22]%7D]&return_content=true)

#### getPage

Use this method to get a Telegraph page. Returns a [Page](#Page)  object on success.

*   **path** (_String_)_Required_. Path to the Telegraph page (in the format `Title-12-31`, i.e. everything that comes after `http://telegra.ph/`).
*   **return\_content** (_Boolean, default = false_)
    If _true_, `content` field will be returned in [Page](#Page)  object.

> **Sample request
> **[https://api.telegra.ph/getPage/Sample-Page-12-15?return\_content=true](https://api.telegra.ph/getPage/Sample-Page-12-15?return_content=true)

#### getPageList

Use this method to get a list of pages belonging to a Telegraph account. Returns a [PageList](#PageList)  object, sorted by most recently created pages first.

*   **access\_token** (_String_)
    _Required_. Access token of the Telegraph account.
*   **offset** (_Integer, default = 0_)
    Sequential number of the first page to be returned.
*   **limit** (_Integer, 0-200, default = 50_)
    Limits the number of pages to be retrieved.

> **Sample request
> **[https://api.telegra.ph/getPageList?access\_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&limit=3](https://api.telegra.ph/getPageList?access_token=d3b25feccb89e508a9114afb82aa421fe2a9712b963b387cc5ad71e58722&limit=3)

#### getViews

Use this method to get the number of views for a Telegraph article. Returns a [PageViews](#PageViews)  object on success. By default, the total number of page views will be returned.

*   **path** (_String_)
    _Required_. Path to the Telegraph page (in the format `Title-12-31`, where 12 is the month and 31 the day the article was first published).
*   **year** (_Integer, 2000-2100_)
    _Required if month is passed_. If passed, the number of page views for the requested year will be returned.
*   **month** (_Integer, 1-12_)
    _Required if day is passed_. If passed, the number of page views for the requested month will be returned.
*   **day** (_Integer, 1-31_)
    _Required if hour is passed_. If passed, the number of page views for the requested day will be returned.
*   **hour** (_Integer, 0-24_)
    If passed, the number of page views for the requested hour will be returned.

> **Sample request
> **[https://api.telegra.ph/getViews/Sample-Page-12-15?year=2016&month=12](https://api.telegra.ph/getViews/Sample-Page-12-15?year=2016&month=12)

### Available types

All types used in the Telegraph API responses are represented as JSON-objects. Optional fields may be not returned when irrelevant.

#### Account

This object represents a Telegraph account.

*   **short\_name** (_String_)Account name, helps users with several accounts remember which they are currently using. Displayed to the user above the "Edit/Publish" button on Telegra.ph, other users don't see this name.
*   **author\_name** (_String_)Default author name used when creating new articles.
*   **author\_url** (_String_)Profile link, opened when users click on the author's name below the title. Can be any link, not necessarily to a Telegram profile or channel.
*   **access\_token** (_String_)
    _Optional. Only returned by the_ [_createAccount_](#createAccount)  _and_ [_revokeAccessToken_](#revokeAccessToken)  _method._ Access token of the Telegraph account.
*   **auth\_url** (_String_)
    _Optional_. URL to authorize a browser on [telegra.ph](./index.md)  and connect it to a Telegraph account. This URL is valid for only one use and for 5 minutes only.
*   **page\_count** (_Integer_)
    _Optional_. Number of pages belonging to the Telegraph account.

#### PageList

This object represents a list of Telegraph articles belonging to an account. Most recently created articles first.

*   **total\_count** (_Integer_)
    Total number of pages belonging to the target Telegraph account.
*   **pages** (_Array of_ [_Page_](#Page) )
    Requested pages of the target Telegraph account.

#### Page

This object represents a page on Telegraph.

*   **path** (_String_)
    Path to the page.
*   **url** (_String_)
    URL of the page.
*   **title** (_String_)
    Title of the page.
*   **description** (_String_)
    Description of the page.
*   **author\_name** (_String_)
    _Optional_. Name of the author, displayed below the title.
*   **author\_url** (_String_)
    _Optional_. Profile link, opened when users click on the author's name below the title. Can be any link, not necessarily to a Telegram profile or channel.
*   **image\_url** (_String_)
    _Optional_. Image URL of the page.
*   **content** (_Array of_ [_Node_](#Node) )
    _Optional_. [Content](#Content-format)  of the page.
*   **views** (_Integer_)
    Number of page views for the page.
*   **can\_edit** (_Boolean_)
    _Optional. Only returned if access\_token passed_. _True_, if the target Telegraph account can edit the page.

#### PageViews

This object represents the number of page views for a Telegraph article.

*   **views** (_Integer_)
    Number of page views for the target page.

#### Node

This abstract object represents a DOM Node. It can be a _String_ which represents a DOM text node or a [NodeElement](#NodeElement)  object.

#### NodeElement

This object represents a DOM element node.

*   **tag** (_String_)Name of the DOM element. Available tags: _a_, _aside_, _b_, _blockquote_, _br_, _code_, _em_, _figcaption_, _figure_, _h3_, _h4_, _hr_, _i_, _iframe_, _img_, _li_, _ol_, _p_, _pre_, _s_, _strong_, _u_, _ul_, _video_.
*   **attrs** (_Object_)_Optional._ Attributes of the DOM element. Key of object represents name of attribute, value represents value of attribute. Available attributes: _href_, _src_.
*   **children** (_Array of_ [_Node_](#Node) )_Optional._ List of child nodes for the DOM element.

### Content format

The Telegraph API uses a DOM-based format to represent the content of the page. Below is an example of code in javascript which explains how you can use it:

function domToNode(domNode) {
  if (domNode.nodeType == domNode.TEXT\_NODE) {
    return domNode.data;
  }
  if (domNode.nodeType != domNode.ELEMENT\_NODE) {
    return false;
  }
  var nodeElement = {};
  nodeElement.tag = domNode.tagName.toLowerCase();
  for (var i = 0; i < domNode.attributes.length; i++) {
    var attr = domNode.attributes\[i\];
    if (attr.name == 'href' || attr.name == 'src') {
      if (!nodeElement.attrs) {
        nodeElement.attrs = {};
      }
      nodeElement.attrs\[attr.name\] = attr.value;
    }
  }
  if (domNode.childNodes.length > 0) {
    nodeElement.children = \[\];
    for (var i = 0; i < domNode.childNodes.length; i++) {
      var child = domNode.childNodes\[i\];
      nodeElement.children.push(domToNode(child));
    }
  }
  return nodeElement;
}

function nodeToDom(node) {
  if (typeof node === 'string' || node instanceof String) {
    return document.createTextNode(node);
  }
  if (node.tag) {
    var domNode = document.createElement(node.tag);
    if (node.attrs) {
      for (var name in node.attrs) {
        var value = node.attrs\[name\];
        domNode.setAttribute(name, value);
      }
    }
  } else {
    var domNode = document.createDocumentFragment();
  }
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children\[i\];
      domNode.appendChild(nodeToDom(child));
    }
  }
  return domNode;
}

var article = document.getElementById('article');
var content = domToNode(article).children;
$.ajax('https://api.telegra.ph/createPage', {
  data: {
    access\_token:   '%access\_token%',
    title:          'Title of page',
    content:        JSON.stringify(content),
    return\_content: true
  },
  type: 'POST',
  dataType: 'json',
  success: function(data) {
    if (data.content) {
      while (article.firstChild) {
        article.removeChild(article.firstChild);
      }
      article.appendChild(nodeToDom({children: data.content}));
    }
  }
});