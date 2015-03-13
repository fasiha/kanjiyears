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
var kanjiToGrade, gradeToKanji;
getOnline('wiki.json').then(function(json) {
  json = JSON.parse(json);
  kanjiToGrade = _.object(_.pluck(json, 'New'), _.pluck(json, 'Grade'));
  gradeToKanji = _.invert(kanjiToGrade, true);
});

// From Kajikun: objects mapping kanji to kanken and vice versa.
var kanjiToKanken, kankenToKanji;
getOnline('kanken.json').then(function(json) {
  kankenToKanji = _.mapValues(JSON.parse(json), function(s) { return s.split(''); });
  kanjiToKanken = _.object(_.flatten(_.map(kankenToKanji, function(kanjis, kanken) {
    return kanjis.map(function(kanji) { return [ kanji, kanken ]; });
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
  function displayResults(domSelectionName, hash, hashKeysArray, headingFunction,
                          completeHash) {
    // Clear old display
    d3.select(domSelectionName).html('');

    var percentPormatter = d3.format('2.2p');

    var divs = d3.select(domSelectionName)
                   .selectAll('div')
                   .data(hashKeysArray ? hashKeysArray : _.keys(hash))
                   .enter()
                   .append('div')
                   .classed('data-box', true);
    divs.append('p')
        .html(function(d, i) { return headingFunction(d); })
        .classed('kanji-group-heading', true)
        .append('span')
        .html(function(d, i) {
      return '&rarr;' + hash[d].length + ' kanji' +
             (completeHash && completeHash[d]
                  ? ', ' + percentPormatter(hash[d].length / completeHash[d].length) +
                        ' coverage'
                  : '');
    });
    divs.append('p').html(function(d, i) { return hash[d].join(''); });
    divs.append('p').html(function(d, i) {
      return 'Missing kanji: ' + _.difference(completeHash[d], hash[d]).join('');
    }).classed('missing-kanji');
    return divs;
  }

  // Display by grade
  displayResults('#output-grade-contents', inputGradeToKanji, null, function(d) {
    var heading = "Grade " + d;
    if (d === "undefined") {
      heading = "Non-jōyō";
    } else if (d === "S") {
      heading = "Secondary school";
    }
    return heading;
  }, gradeToKanji);

  // Display non-joyo and secondary school kanji by kanken
  displayResults(
      '#output-kanken-contents', kankenToRareKanji,
      _.sortBy(_.keys(kankenToRareKanji), function(x) { return x ? -x : NaN; }),
      function(d) { return d !== 'undefined' ? 'Kanken ' + d : 'Non-kanken'; },
      kankenToKanji);
}
