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

// Setup

// Grab Wikipedia's joyo kanji table and extract relevant columns. `kanjiToGrade` is an
// object with keys as kanji and values as the grade (as a string).
var kanjiToGrade;
getOnline('wiki.json').then(function(json) {
  json = JSON.parse(json);
  kanjiToGrade = _.object(_.pluck(json, 'New'), _.pluck(json, 'Grade'));
});

// From Kajikun: object with kanji as keys and kanken as values.
var kanjiToKanken;
getOnline('kanken.json').then(function(json) {
  json = JSON.parse(json);
  kanjiToKanken = _.object(_.flatten(_.map(json, function(kanjis, kanken) {
    return kanjis.split('').map(function(kanji) { return [ kanji, kanken ]; });
  })));
});

// Business logic: returns an object whose keys are grades (or "undefined"), and values an
// array of associated kanji ("undefined" --> non-joyo kanji).
function analyzeGrades(input) { return analyzeInputByHash(input, kanjiToGrade); }

// Similarly an object with keys as kanken levels (or "undefined") and values kanji
// ("undefined" --> unknown kanken)
function analyzeKanken(input) { return analyzeInputByHash(input, kanjiToKanken); }

function analyzeInputByHash(inputString, hash) {
  if (hash === undefined) {
    console.log('Data not yet loaded. Returning empty.');
    return {};
  }
  var kanji = _.unique(inputString.match(hanRegexp));
  return _.groupBy(kanji, function(k) { return hash[k]; });
}

// DOM functionality: attach event listener
d3.select("#submit-button").on('click', run);

function run() {
  // Get input string and process it, producing two object hashes
  var input = d3.select('#input-japanese').property('value');

  // All kanji grouped into grades
  var inputGradeToKanji = analyzeGrades(input);
  // Secondary school and non-joyo kanji grouped per kanken
  var kankenToRareKanji =
      analyzeKanken(_.union(inputGradeToKanji.undefined, inputGradeToKanji.S).join(''));

  // And update it with the new one
  // - domSelectionName: DOM element selector
  // - hash: object with keys as some kind of groupings and values as an array of kanji
  // - hashKeysArray: if falsey, _.keys(hash), otherwise, an array of `hash`'s keys
  // - headingFunction: function that accepts an element of hashKeysArray (a string) and
  //     returns a new string titling the kanji group
  function displayResults(domSelectionName, hash, hashKeysArray, headingFunction) {
    return d3.select(domSelectionName)
        .append('ul')
        .selectAll('li')
        .data(hashKeysArray ? hashKeysArray : _.keys(hash))
        .enter()
        .append('li')
        .text(function(d, i) {
      var kanjis = hash[d];
      var heading = headingFunction(d);
      return heading + ' (' + kanjis.length + ' kanji): ' + kanjis.join('');
    });
  }

  // Display by grade
  displayResults('#output-grade', inputGradeToKanji, null, function(d) {
    var heading = "Grade " + d;
    if (d === "undefined") {
      heading = "Non-joyo";
    } else if (d === "S") {
      heading = "Secondary school";
    }
    return heading;
  });

  // Display non-joyo and secondary school kanji by kanken
  displayResults(
      '#output-kanken', kankenToRareKanji,
      _.sortBy(_.keys(kankenToRareKanji), function(x) { return x ? -x : NaN; }),
      function(d) { return d !== 'undefined' ? 'Kanken ' + d : 'Non-kanken'; });
}
