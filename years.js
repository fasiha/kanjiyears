// Libraries loaded externally
var d3, XRegExp, _;

// Promise-based helper function to get the plaintext contents of URLs
function getOnline(url) {
  return new Promise(function(fulfill, reject) {
    d3.xhr(url, 'text/plain', function(err, req) {
      if (err) {
        reject(err);
      } else {
        fulfill(req.responseText);
      }
    });
  });
}

// Cache this since presumably it might be used regularly: regular expression to capture
// all Chinese characters
var hanRegexp = XRegExp('\\p{Han}', 'g');

// Setup: grab Wikipedia's joyo kanji table and extract relevant columns. `kanjiToGrade`
// is an object with keys as kanji and values as the grade (as a string).
var kanjiToGrade;
getOnline('wiki.json').then(function(json) {
  json = JSON.parse(json);
  kanjiToGrade = _.object(_.pluck(json, 'New'), _.pluck(json, 'Grade'));
});

// Business logic: returns an object whose keys are grades (or "undefined"), and values an
// array of associated kanji ("undefined" --> non-joyo kanji).
function analyze(input) {
  if (kanjiToGrade === undefined) {
    console.log('Joyo kanji not yet loaded. Returning empty.');
    return {};
  }
  var kanji = _.unique(input.match(hanRegexp));
  return _.groupBy(kanji, function(k) { return kanjiToGrade[k]; });
}

// DOM functionality: attach event listener
d3.select("#submit-button").on('click', run);

function run() {
  // Get input string and process it with inputGradeToKanji
  var input = d3.select('#input-japanese').property('value');
  var inputGradeToKanji = analyze(input);

  var outputDiv = d3.select('#output');
  // Clear existing content
  outputDiv.html('');

  // And update it with the new one
  var gradeDivs = outputDiv.append('ul')
                      .selectAll('li')
                      .data(_.keys(inputGradeToKanji))
                      .enter()
                      .append('li')
                      .text(function(d, i) {
    var kanjis = inputGradeToKanji[d];

    // Wikipedia's "Grades" are 1-6 and "S" (secondary).
    var heading = "Grade " + d;
    if (d === "undefined") {
      heading = "Non-joyo";
    } else if (d === "S") {
      heading = "Secondary";
    }
    return heading + ' (' + kanjis.length + ' kanji): ' + kanjis.join('');
  });
}
