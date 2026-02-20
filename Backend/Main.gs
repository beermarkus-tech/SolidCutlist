/**
 * Backend/Main.gs
 * This is the front door to our app. When a user visits the Web App URL,
 * Google runs doGet() which builds our HTML page.
 */

function doGet(e) {
  // Create a template from our main index file
  var template = HtmlService.createTemplateFromFile('Frontend/index');
  
  // Evaluate the template (this executes our include() tags) and serve it
  return template.evaluate()
      .setTitle('LumberLogic')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0') // Crucial for mobile-first
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper function called from inside the HTML files to inject other files.
 * This is what stitches our modular architecture together.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}