const sql2json = require('./sql2json');
const Json2sql = sql2json.json2sql;
const Sql2json = sql2json.sql2json;

// NOTE module hangs on semicolon
// obj = new Sql2json("select height, weight, color from item;");

/*
 * newTable returns a new name for tables, maintains it's own internal state
 */
var newNameConstructor = function(beginningCharCode) {
  var nameCharCodes = [beginningCharCode - 1];
  return function() {
  var leastSignificantDigit = nameCharCodes.pop()
  leastSignificantDigit += 1;
    if (leastSignificantDigit > beginningCharCode + 25) {
      nameCharCodes.push(beginningCharCode)
      nameCharCodes.push(beginningCharCode)
    } else {
      nameCharCodes.push(leastSignificantDigit)
    }
      return String.fromCharCode(...nameCharCodes);
  }
};

var testString1 = "select height, weight, color from tableA inner join tableB on tableA.id=tableB.foo where height=10 and weight<10";
var testString2 = "select height, weight, color from tableA inner join tableB on tableA.id=tableB.foo where height=10";
var testString3 = "select * from tableA inner join tableB on tableA.id=tableB.foo where height=10";

var obfuscate = function() {
  // reset obfuscators between runs
  var newColumnName = newNameConstructor(97);
  var newTableName = newNameConstructor(65);
  var newTempWhereColumnName = newNameConstructor(97);

  /*
  * parseWhereBranch traverses a branch recursively and replaces any column names
  * TODO build lookup table of replacements to properly obfuscate where clause,
  * for now we naively replace where-clause literals linearly
  * TODO factor out from obfuscate, nested due to dependency on newTempWhereColumnName
  */
  var parseWhereBranch = function(node) {
    if (node.type === 'operator') {
      parseWhereBranch(node.left);
      parseWhereBranch(node.right);
    } else {
      node.value = newTempWhereColumnName();
    }
  };

  // get input
  var inputArea = document.getElementById('input');
  var inputString = inputArea.value;
  if (inputString === '') {
    // user did not provide input, obfuscate placeholder text
    inputString = inputArea.placeholder;
  }

  // obfuscate input
  obj = new Sql2json(inputString);
  json = obj.toJSON();
  json.select.forEach((selection) => {
    selection.value = newColumnName()
  })
  json.from = 'A'
  if(json.where) {
    parseWhereBranch(json.where.left)
    parseWhereBranch(json.where.right)
  }
  var result = Json2sql.toSQL(json);

  // put input in DOM
  console.log(result);
  return result;
}

document.addEventListener("DOMContentLoaded", function(event) {
  document.getElementById('submit').onclick = obfuscate;
});