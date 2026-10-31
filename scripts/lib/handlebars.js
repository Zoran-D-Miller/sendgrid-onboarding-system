// handlebars.js configured to behave like SendGrid's renderer for the helpers
// we use. handlebars.js does not ship SendGrid's custom helpers, so `equals`
// and `notEquals` are shimmed to match SendGrid's documented behaviour
// (loose comparison: SendGrid treats 3 and "3" as equal).
//
// Local rendering is a preview, not proof: nested equals was also confirmed
// in SendGrid's own editor preview (see docs/QA_CHECKLIST.md).

const Handlebars = require("handlebars");

Handlebars.registerHelper("equals", function (a, b, options) {
  // eslint-disable-next-line eqeqeq
  return a == b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper("notEquals", function (a, b, options) {
  // eslint-disable-next-line eqeqeq
  return a != b ? options.fn(this) : options.inverse(this);
});

module.exports = Handlebars;
