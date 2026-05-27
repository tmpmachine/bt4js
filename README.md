# bt4js

JavaScript Blogger template development.

In `src/**/*.html`, `<b-include>` tags use the `template` attribute to reference the `id` of a `<template>` element. During processing, the `<b-include>` tag is replaced with the target template element.

Example:

```html
<b-include template="post-card"></b-include>

<template id="post-card"> ... </template>
```

In `src/**/*.html`, `<file src="...">` tags are custom include tags. During processing, they are replaced with the file content at the `src` value, resolved relative to the HTML file that contains the tag.

Example:

```html
<file src="./partials/header.html"></file>
```

In `src/**/*.html`, `<b-widget>` tags render widget data through a template. The `id` attribute is the widget data ID, and the `template` attribute references the `id` of a `<template>` element. During processing, the `<b-widget>` tag is replaced with the target template element, and the widget data for that widget ID is passed into the template for rendering by the page builder script.

Example:

```html
<b-widget id="Blog1" template="BlogWidget"></b-widget>

<template id="BlogWidget"> ... </template>
```

In `src/**/*.html`, `b-data` is a custom attribute for replacing a tag's `innerHTML` with a value from the current widget data. The value of `b-data` is the widget data key.

Example:

```html
<h1 b-data="title"></h1>
```

If the widget data key points to an array, add `b-template` to render each item in the array. The value of `b-template` is the `id` of a `<template>` element used for each loop item.

Example:

```html
<div b-data="posts" b-template="PostItem"></div>

<template id="PostItem"> ... </template>
```

In `src/**/*.html`, `b-if` is a custom conditional attribute. Its value is a widget data key. During processing, the value is evaluated; if it is true, the tag is kept in the output, and if it is false, the tag is excluded from the output. The expected widget data type is boolean, but an empty string also evaluates as false.

Prepend `!` to the widget data key to invert the boolean value.

Example:

```html
<section b-if="showFeatured"></section>
<section b-if="!showFeatured"></section>
```
