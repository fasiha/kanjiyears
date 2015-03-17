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

// Regular expression to capture all Chinese characters, via XRegExp
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

// From Kanken.or.jp, colors: http://www.kanken.or.jp/kanken/outline/degree.html
var KANKENCOLORS = {
  1 : "#004129",
  1.5 : "#690212",
  2 : "#00437C",
  2.5 : "#E8380D",
  3 : "#008A6C",
  4 : "#B81649",
  5 : "#F7AB00",
  6 : "#5B1F67",
  7 : "#0096BB",
  8 : "#C4D700",
  9 : "#6D70B3",
  10 : "#E00083"
};
// Kanken levels 10--5 correspond to grades 1--6.
_.range(1, 6 + 1).map(function(grade) {
  return KANKENCOLORS['grade-' + grade] = KANKENCOLORS[10 - grade + 1];
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

function ichiWidth() { return d3.select('#ruler').node().getBoundingClientRect().width; }

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
  // - completeHash: while `hash` tells you what's in a group that's also in the current
  //     input, `completeHash` has the *full* group. If available, we will show what's in
  //     each group but missing in the input.
  function displayResults(domSelectionName, hash, hashKeysArray, headingFunction,
                          completeHash, colorLookupPrefixString) {
    // Clear old display
    d3.select(domSelectionName).html('');

    // Display percentages with two significant digits
    var percentFormatter = d3.format('2.2p');

    // Probably too fancy, but calculate how many kanji will fit in one line. For missing
    // kanji (kanji not in input but in a given group, calculated using `completeHash` as
    // well as `hash`), we'll only show this many kanji.
    var listTruncationLimit = Math.floor(
        d3.select(domSelectionName).node().getBoundingClientRect().width / ichiWidth() -
        3);

    // For each *group* (each key in `hash`), create a div to hold it, and then just
    // append to those divs all the elements of interest.
    var divs = d3.select(domSelectionName)
                   .selectAll('div')
                   .data(hashKeysArray ? hashKeysArray : _.keys(hash))
                   .enter()
                   .append('div')
                   .classed('data-box', true)
                   .style("border-color", function(d, i) {
                     return KANKENCOLORS[(colorLookupPrefixString || "") + d] || "white";
                   });

    // Append heading
    divs.append('p')
        .html(function(d, i) { return headingFunction(d); })
        .classed('kanji-group-heading', true)
        .append('span')
        .html(function(d, i) {
      return ' &rarr; ' + hash[d].length + ' kanji' +
             (completeHash && completeHash[d]
                  ? ', ' + percentFormatter(hash[d].length / completeHash[d].length) +
                        ' coverage'
                  : '');
    }).classed('sidebar', true);

    // Append the kanji actually used. Funnily this is the shortest code but most
    // important.
    divs.append('p').html(function(d, i) { return hash[d].join(''); }).classed(
        'used-kanji', true);

    // If `completeHash` available, there are often many kanji in it but missing from the
    // input, so show only `listTruncationLimit` of them and hide the rest. They can be
    // shown by clicking.

    // This is a helper function that'll remember the kanji to show initially (one row's
    // worth) and which to hide. It's done like this (memoized to avoid recalculating)
    // because this information is needed by two separate callbacks. Well, technically it
    // could all be stuffed into a single html() call, but I wanted to break up the
    // contents using `d3.append` more than that.
    var processMissing = _.memoize(function(d) {
      return (completeHash && completeHash[d])
                 ? _.difference(completeHash[d], hash[d]).join('')
                 : '';

    });
    // Append the first line of missing kanji, then an ellipses, and then in a hidden
    // span, the rest of them. Add the event listener to unhide them.
    divs.append('p')
        .html(
             function(d, i) {
               var missing = processMissing(d);
               if (missing.length === 0) {
                 return "";
               }
               var moreLines = Math.ceil(missing.length / listTruncationLimit);
               return '<span class="ellipses">(show missing kanji, ' + moreLines +
                      ' row' + (moreLines > 1 ? 's' : '') +
                      ')</span><span class="hidden">（' + missing + '）</span>';
             })
        .classed('missing-kanji linkable', true)
        .on('click', function(d) {
          var self = d3.select(this);
          self.select('.ellipses').remove();
          self.select('.hidden').classed('hidden', false);
          self.classed('linkable', false);
        });

    // A button that'll show all the hidden content (and then deletes itself). This might
    // be foolishly shown when there's no hidden content, so FIXME.
    if (completeHash) {
      d3.select(domSelectionName)
          .append('button')
          .classed('pure-button show-all-button', true)
          .html('Show all missing kanji')
          .on('click', function() {
            d3.selectAll('.hidden').classed('hidden', false);
            d3.selectAll('.ellipses').remove();
            d3.selectAll('.show-all-button').remove();
          });
    }
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
  }, gradeToKanji, 'grade-');

  // Display non-joyo and secondary school kanji by kanken
  displayResults(
      '#output-kanken-contents', kankenToRareKanji,
      _.sortBy(_.keys(kankenToRareKanji), function(x) { return x ? -x : NaN; }),
      function(d) { return d !== 'undefined' ? 'Kanken ' + d : 'Non-kanken'; },
      kankenToKanji);

  var stats = _.sortBy(_.range(10, 2 - 1, -1).concat([2.5]), function(x) { return -x; })
                  .map(function(kanken) {
    var summary;
    if (kanken >= 5) {
      var grade = 10 - kanken + 1;
      summary = {
        description : 'Grade ' + grade,
        seen : (inputGradeToKanji[grade] || []).length,
        total : gradeToKanji[grade].length,
        color : d3.hcl(KANKENCOLORS['grade-' + grade])
      };
    } else {
      summary = {
        description : 'Kanken ' + kanken,
        seen : (kankenToRareKanji[kanken] || []).length,
        total : kankenToKanji[kanken].length,
        color : d3.hcl(KANKENCOLORS[kanken])
      };
    }
    return summary;
  });
  d3.select('#stats-output').html('');
  var boxes =
      d3.select('#stats-output')
          .selectAll('div')
          .data(stats)
          .enter()
          .append('div')
          .classed('outer-box', true)
          .style('background', function(d) { return d.color.brighter(1.25).toString(); });
  boxes.append('div')
      .classed('inner-box', true)
      .style('height', function(d, i) { return (100 * d.seen / d.total) + '%'; })
      .style('background', function(d) { return d.color.toString(); })
      .style('color', function(d) { return (d.color.l > 70 ? "black" : "white"); })
      .text(function(d, i) { return d.description + ' ' + d.seen + '/' + d.total; });

  return {inputGrade : inputGradeToKanji, inputKanken : kankenToRareKanji, stat : stats};
}
