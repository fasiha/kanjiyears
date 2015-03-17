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

// Display percentages with two significant digits
var percentFormatter = d3.format('2.2p');

// Setup

// From Kajikun: objects mapping kanji to kanken and vice versa.
var kanjiToKanken, kankenToKanji, joyoKanji;
getOnline('kanken.json').then(function(json) {
  kankenToKanji = _.mapValues(JSON.parse(json), function(s) { return s.split(''); });
  kanjiToKanken = _.object(_.flatten(_.map(kankenToKanji, function(kanjis, kanken) {
    return kanjis.map(function(kanji) { return [ kanji, kanken ]; });
  })));
  joyoKanji = _.flatten(_.values(kankenToKanji));
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

// Business logic: returns an object whose keys are kanken levels (or "undefined"), and
// values an object representing associated kanji ("undefined" --> non-joyo kanji).
function analyzeKanken(inputString) {
  if (kanjiToKanken === undefined) {
    console.log('Data not yet loaded. Returning empty.');
    return {};
  }
  var kanji = _.unique(inputString.match(hanRegexp));
  var kankenToInputKanji = _.groupBy(kanji, function(k) { return kanjiToKanken[k]; });

  var inputToKankenObj =
      _.object(_.keys(kankenToKanji), _.keys(kankenToKanji).map(function(kanken) {
    var kanji = kankenToInputKanji[kanken] || [];
    var missing = _.difference(kankenToKanji[kanken], kanji);
    return {
      kanken : kanken,
      grade : 10 - kanken + 1,
      kanjiUsed : kanji,
      numKanjiUsed : kanji.length,
      kanjiMissing : missing,
      numKanjiMissing : missing.length,
      color : d3.hcl(KANKENCOLORS[kanken]),
      numTotal : kanji.length + missing.length
    };
  }));
  var nonJoyo = _.difference(kanji, joyoKanji);
  inputToKankenObj[null] = {
    kanken : null,
    grade : null,
    kanjiUsed : nonJoyo,
    numKanjiUsed : nonJoyo.length,
    kanjiMissing : [],
    numKanjiMissing : 0,
    color : d3.hcl("#ffffff"),
    numTotal : nonJoyo.length
  };
  return inputToKankenObj;
}

// DOM functionality: attach event listener
d3.select("#submit-button").on('click', run);

function run() {
  // Get input string and process it, producing a hash with keys as kanken levels and
  // values as a hash of details
  var inputAnalysis = analyzeKanken(d3.select('#input-japanese').property('value'));

  // Kanken levels 10 to 5 correspond to primary school grades 1 to 6. Create an array of
  // values from `inputAnalysis` for primary and secondary school separately
  var primaryKankens = _.range(10, 5 - 1, -1).map(function(x) { return '' + x; });
  var primarySchool =
      primaryKankens.map(function(kanken) { return inputAnalysis[kanken]; });
  var secondarySchool = _.sortBy(_.difference(_.keys(kankenToKanji), primaryKankens),
                                 function(x) { return -x; })
                            .map(function(kanken) { return inputAnalysis[kanken]; });
  // Create a one-element array of the non-joyo kanji in input
  var nonJoyo = [inputAnalysis[null]];

  // Clear the old output data and start writing!
  d3.select('#output').html('');

  // First, some semi-fancy stats.
  var kankenLevels = _.sortBy(_.keys(kankenToKanji), function(x) { return -x; });
  var boxes =
      d3.select('#output')
          .append('div')
          .classed('pure-u-1', true)
          .selectAll('div')
          .data(kankenLevels.map(function(k) { return inputAnalysis[k]; }))
          .enter()
          .append('div')
          .classed('stat-outer-box', true)
          .style('background', function(d) { return d.color.brighter(1.25).toString(); });

  boxes.append('div')
      .classed('stat-inner-box', true)
      .style('height',
             function(d, i) { return (100 * d.numKanjiUsed / d.numTotal + '%'); })
      .style('background', function(d) { return d.color.toString(); })
      .style('color', function(d) { return (d.color.l > 70 ? "black" : "white"); })
      .text(function(d, i) {
    return 'Kanken ' + d.kanken + ' ' + d.numKanjiUsed + '/' + d.numTotal;
  });

  // Next, call a display helper function for the three groupings: primary school,
  // secondary school, and non-school (non-joyo) kanji
  displayResults(primarySchool, "Primary school kanji");
  displayResults(secondarySchool, "Secondary school kanji", false);
  if (nonJoyo[0].numKanjiUsed > 0) {
    displayResults(nonJoyo, "Non-jōyō kanji", false, false);
  }

  // Here's that helper function:
  // - groups: an array of hash objects containing fields such as kanken, grade,
  // kanjiUsed, kanjiMissing, etc.
  // - title: the heading to use to describe the group (i.e., "Primary school kanji")
  // - showGrade: boolean. If true, convert kanken level to grade and show it
  // - twoCol: boolean. If true, show this group as two columns, else single column.
  function displayResults(groups, title, showGrade, twoCol) {
    if (typeof showGrade === 'undefined') {
      showGrade = true;
    }
    if (typeof twoCol === 'undefined') {
      twoCol = true;
    }

    if (!_.any(_.pluck(groups, 'numKanjiUsed'))) {
      return [];
    }

    // For each function invokation, create a parent div to contain the whole group. Then
    // inside that parent, create divs corresponding to each kanken level therein to hold
    // it, and then just append to those divs all the remaining display elements.
    var parent = d3.select('#output').append('div').classed('pure-u-1', true).classed(
        'pure-u-md-1-2', twoCol);
    parent.append('p').classed('output-title', true).text(title);

    // Create a div for each element of `group` (a single kanken level).
    var divs = parent.selectAll('div')
                   .data(groups)
                   .enter()
                   .append('div')
                   .attr('class', function(d, i) { return 'kanken-' + d.kanken; })
                   .classed('data-box', true)
                   .style("border-color",
                          function(d, i) { return KANKENCOLORS[d.kanken] || "white"; });

    // Append heading and some coverage information in a smaller font
    divs.append('p')
        .html(
             function(d, i) {
               return d.kanken
                          ? "Kanken " + d.kanken +
                                (showGrade ? ' (grade ' + d.grade + ')' : '')
                          : "Non-jōyō";
             })
        .classed('kanji-group-heading', true)
        .append('span')
        .html(function(d, i) {
      return ' &rarr; ' + d.numKanjiUsed + ' kanji ' +
             (d.numKanjiMissing
                  ? percentFormatter(d.numKanjiUsed / d.numKanjiMissing) + ' coverage'
                  : '');
    }).classed('sidebar', true);

    // Append the kanji actually used. Funnily this is the shortest code but most
    // important.
    divs.append('p').html(function(d, i) { return d.kanjiUsed.join(''); }).classed(
        'used-kanji', true);

    // Append an invitation to click to reveal missing kanji, and then in a hidden span,
    // the rest of them. Add the event listener to unhide them.
    divs.append('p')
        .html(
             function(d, i) {
               var missing = d.kanjiMissing;
               if (missing.length === 0) {
                 return "";
               }

               return '<span class="ellipses">(show ' + d.numKanjiMissing +
                      ' missing kanji' +
                      ')</span><span class="hidden">（' + missing.join('') + '）</span>';
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
    parent.append('button')
        .classed('pure-button show-all-button', true)
        .html('Show all missing kanji')
        .on('click', function() {
          d3.selectAll('.hidden').classed('hidden', false);
          d3.selectAll('.ellipses').remove();
          d3.selectAll('.show-all-button').remove();
        });

    return divs;
  }
}

function ichiWidth() { return d3.select('#ruler').node().getBoundingClientRect().width; }
