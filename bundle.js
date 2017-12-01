(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
},{"./sql2json":2}],2:[function(require,module,exports){
module.exports.json2sql = require('./lib/json2sql');
module.exports.sql2json = require('./lib/sql2json');
},{"./lib/json2sql":3,"./lib/sql2json":4}],3:[function(require,module,exports){
function json2sql() {}


const parseFunction = (nodeFun) => {
    const args = [];
    for (let i = 0, length = nodeFun.arguments.length; i < length; i++) {
        const node = nodeFun.arguments[i];
        switch (node.type) {

            case 'literal':
                args.push(node.value);
                break;
            case 'string':
                args.push(`'${node.value}'`);
                break;
            case 'wildcard':
                args.push(`*`);
                break;
            case 'number':
                args.push(node.value);
                break;
            case 'math':
                args.push(parseMath(node));
                break;
            case 'function':
                args.push(parseFunction(node));
                break;
            default:
                break;

        }
    }
    return `${nodeFun.value}(${args.join(',')})${nodeFun.alias ? ` AS ${nodeFun.alias}` : ''}`;
};

const parseMath = (nodeFun) => {
    const args = [];
    for (let i = 0, length = nodeFun.arguments.length; i < length; i++) {
        const node = nodeFun.arguments[i];
        switch (node.type) {

            case 'literal':
                args.push(node.value);
                break;
            case 'string':
                args.push(`'${node.value}'`);
                break;
            case 'number':
                args.push(node.value);
                break;
            case 'function':
                args.push(parseFunction(node));
                break;
            default:
                break;

        }
    }
    return `${args[0]} ${nodeFun.value} ${args[1]}${nodeFun.alias ? ` AS ${nodeFun.alias}` : ''}`;
};

const parseSelect = (select) => {
    const responses = [];
    if (select) {
        for (let i = 0, length = select.length; i < length; i++) {
            const node = select[i];
            switch (node.type) {

                case 'wildcard':
                    responses.push(`*`);
                    break;
                case 'literal':
                    responses.push(`${node.value}${node.alias ? ` AS ${node.alias}` : ''}`);
                    break;
                case 'string':
                    responses.push(`${node.value}${node.alias ? ` AS ${node.alias}` : ''}`);
                    break;
                case 'function':
                    responses.push(parseFunction(node));
                    break;
                case 'number':
                    responses.push(`${node.value}${node.alias ? ` AS ${node.alias}` : ''}`);
                    break;
                case 'math':
                    responses.push(parseMath(node));
                    break;
                case 'distinct':
                    responses.push(`DISTINCT ${parseSelect(node.arguments)}`);
                    break;
                default:
                    break;

            }
        }
    }
    return responses.join(', ');
};

const parseNodeWhere = (node) => {
    let args = [];
    switch (node.type) {

        case 'literal':
        case 'number':
            return node.value;
        case 'string':
            return `${node.value}`;
        case 'operator':
            return `${parseNodeWhere(node.left)} ${node.value} ${parseNodeWhere(node.right)}`;
        case 'conditional':
            return `${parseNodeWhere(node.left)} ${node.value} ${parseNodeWhere(node.right)}`;
        case 'bracket':
            return `(${parseNodeWhere(node.value)})`;
        case 'in':
            args = [];
            if (node.arguments) {
                for (let i = 0, length = node.arguments.length; i < length; i++) {
                    args.push(parseNodeWhere(node.arguments[i]));
                }
            }
            return `${node.value} IN (${args.join(', ')})`;
        case 'between':
            args = [];
            if (node.arguments) {
                for (let i = 0, length = node.arguments.length; i < length; i++) {
                    args.push(parseNodeWhere(node.arguments[i]));
                }
            }
            return `${node.value} BETWEEN ${parseNodeWhere(node.arguments[0])} AND ${parseNodeWhere(node.arguments[1])}`;
        case 'function':
            args = [];
            if (node.arguments) {
                for (let i = 0, length = node.arguments.length; i < length; i++) {
                    args.push(parseNodeWhere(node.arguments[i]));
                }
            }
            return `${node.value}(${args.join(', ')})`;
        default:
            return node.value;

    }
};

const parseWhere = (node) => {
    if (node) {
        return `WHERE ${parseNodeWhere(node)}`;
    }
    return '';
};

const parseOrderBy = (orderBy) => {
    if (orderBy) {
        const responses = [];
        for (let i = 0, length = orderBy.length; i < length; i++) {
            if (orderBy[i].type === 'function') {
                responses.push(`${parseFunction(orderBy[i])}${orderBy[i].direction ? ` ${orderBy[i].direction}` : ''}`)
            } else {
                responses.push(`${orderBy[i].value}${orderBy[i].direction ? ` ${orderBy[i].direction}` : ''}`);
            }
        }
        return `ORDER BY ${responses.join(', ')}`;
    }
    return '';
};


const parseGroupBy = (group) => {
    if (group) {
        const result = [];
        for (let i = 0, length = group.length; i < length; i++) {
            const node = group[i];
            switch (node.type) {

                case 'literal':
                    result.push(`${node.value}`);
                    break;
                case 'number':
                    result.push(`${node.value}`);
                    break;
                case 'function':
                    result.push(parseFunction(node));
                    break;
                default:
                    break;

            }
        }
        return `GROUP BY ${result.join(', ')}`;
    }
    return '';
};

json2sql.toSQL = (data) => {
    if (!data) {
        throw new Error('JSON required');
    }
    if (!data.delete) {
        return `SELECT ${parseSelect(data.select)} FROM ${data.from}${data.where ? ` ${parseWhere(data.where)}` : ''}${data.group ? ` ${parseGroupBy(data.group)}` : ''}${data.orderBy ? ` ${parseOrderBy(data.orderBy)}` : ''}${data.limit ? ` LIMIT ${data.limit}` : ''}${data.offset ? ` OFFSET ${data.offset}` : ''}`.trim();
    } else {
        return `DELETE FROM ${data.from}${data.where ? ` ${parseWhere(data.where)}` : ''}${data.group ? ` ${parseGroupBy(data.group)}` : ''}${data.orderBy ? ` ${parseOrderBy(data.orderBy)}` : ''}${data.limit ? ` LIMIT ${data.limit}` : ''}${data.offset ? ` OFFSET ${data.offset}` : ''}`.trim();
    }
};

json2sql.parseNodeWhere = parseNodeWhere;
json2sql.parseFunction = parseFunction;
module.exports = json2sql;

},{}],4:[function(require,module,exports){
const lexer = require('sql-parser').lexer;

const postgisFunctions = /^(ST_SummaryStatsAgg|ST_value|st_valueCount|st_transform|ST_Intersects|st_buffer|ST_AsGeoJson|ST_SetSRID|ST_GeomFromGeoJSON|ST_METADATA|ST_SUMMARYSTATS|ST_HISTOGRAM|TO_NUMBER|TO_CHAR|ST_GeoHash|first|last|ST_BANDMETADATA|st_centroid|round|trunc|abs|ceil|exp|floor|power|sqrt|acos|asin|atan|atan2|cos|cot|sin|tan|to_timestamp|ST_X|ST_Y|CF_[a-zA-Z0-9_-])$/gi;
const between = /^between$/gi;
const sqlStatements = /^delete$/gi;

const obtainType = function (token) {
    postgisFunctions.lastIndex = 0;
    between.lastIndex = 0;
    sqlStatements.lastIndex = 0;
    if (token[0] === 'LITERAL' && postgisFunctions.test(token[1])) {
        return 'FUNCTION';
    } else if (token[0] === 'LITERAL' && between.test(token[1])) {
        return 'BETWEEN';
    } else if (token[0] === 'LITERAL' && sqlStatements.test(token[1])) {
        return 'DELETE';
    }
    return token[0];
};

function sql2json(sql, experimental=false) {
    if (!sql) {
        throw new Error('Sql required');
    }
    this.sql = sql;
    this.experimental = experimental;
    this.tokens = lexer.tokenize(this.sql);
    this.index = 0;
    this.stack = [];
    this.parsed = {};
}

sql2json.prototype.hasNext = function () {
    return this.index < this.tokens.length;
};

sql2json.prototype.next = function () {
    return this.tokens[this.index++];
};

sql2json.prototype.parseFunction = function (functionName, isInSelect) {
    const stack = [];
    let findParen = false;
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'LITERAL':
                stack.push({
                    value: token[1],
                    type: 'literal'
                });
                break;
            case 'FUNCTION':
                stack.push(this.parseFunction(token[1], isInSelect));
                break;
            case 'SEPARATOR':
                if (!findParen) {
                    return {
                        value: functionName,
                        type: 'literal',
                        alias: null
                    };
                }
                break;
            case 'LEFT_PAREN':
                findParen = true;
                break;
            case 'RIGHT_PAREN':
                if (!findParen) {
                    this.index--;
                    return {
                        type: 'literal',
                        value: functionName
                    };
                }
                return {
                    type: 'function',
                    alias: null,
                    value: functionName,
                    arguments: stack
                };
            case 'STRING':
                stack.push({
                    value: `'${token[1]}'`,
                    type: 'string'
                });
                break;
            case 'DBLSTRING':
                stack.push({
                    value: `"${token[1]}"`,
                    type: 'string'
                });
                break;
            case 'NUMBER':
                stack.push({
                    value: parseFloat(token[1]),
                    type: 'number'
                });
                break;
            case 'MATH_MULTI':
            case 'MATH':
                if (stack.length > 0) {
                    stack.push(this.parseMath(token[1], stack.pop()));
                } else {
                    stack.push({
                        value: '*',
                        alias: null,
                        type: 'wildcard'
                    });
                }
                break;
            default:
                if (!findParen) {
                    this.index--;
                    return {
                        value: functionName,
                        type: 'literal',
                        alias: null
                    };
                }
                stack.push({
                    value: token[1],
                    type: 'literal'
                });

        }
    }
};


sql2json.prototype.parseSelectExperimental = function () {
    this.parsed.select = [];
    let lastParen = false;
    while(this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'FROM':
                this.index--;
                return;
            default:
                let el = null;
                if (this.parsed.select.length > 0) {
                    el = this.parsed.select.pop();
                    if (token[0] === 'STRING') {
                        token[1] = `'${token[1]}'`;
                    }
                    if (token[0] === 'DBLSTRING') {
                        token[1] = `"${token[1]}"`;
                    }
                    if (!lastParen && token[1] !== '(' && token[1] !== ')' && token[1] !== ',' && token[1] !== '.'  && token[1] !== '*') {
                        el.value += ' ' + token[1];
                    } else {
                        if (token[1] === '('){
                            lastParen = true;
                        } else {
                            lastParen = false;
                        }
                        el.value += token[1];
                    }
                } else  {
                    el = {
                        value: token[1],
                        alias: null,
                        type: 'literal'
                    }
                }
                this.parsed.select.push(el);
                break;
        }
    }
};

sql2json.prototype.parseSelect = function () {
    this.parsed.select = [];
    let containAs = false;
    let isDistinct = false;

    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {
            case 'DBLSTRING':
                this.parsed.select.push({
                    value: `"${token[1]}"`,
                    type: 'string'
                });
                break;
            case 'NUMBER':
                this.parsed.select.push({
                    value: parseFloat(token[1]),
                    type: 'number',
                    alias: null
                });
                break;
            case 'STAR':
                this.parsed.select.push({
                    value: '*',
                    alias: null,
                    type: 'wildcard'
                });
                break;
            case 'LEFT_PAREN':
            case 'RIGHT_PAREN':
                this.parsed.select[this.parsed.select.length - 1].value = this.parsed.select[this.parsed.select.length - 1].value + token[1];
                break;

            case 'LITERAL':
            case 'BOOLEAN':
            case 'GROUP':
                if (containAs) {
                    this.parsed.select[this.parsed.select.length - 1].alias = token[1];
                    containAs = false;
                } else {
                    this.parsed.select.push({
                        value: token[1],
                        alias: null,
                        type: 'literal'
                    });
                }
                break;
            case 'STRING':
                if (containAs) {
                    this.parsed.select[this.parsed.select.length - 1].alias = token[1];
                    containAs = false;
                } else {
                    this.parsed.select.push({
                        value: `'${token[1]}'`,
                        alias: null,
                        type: 'string'
                    });
                }
                break;
            case 'MATH_MULTI':
            case 'MATH':
                this.parsed.select.push(this.parseMath(token[1], this.parsed.select.pop()));
                break;
            case 'AS':
                containAs = true;
                break;
            case 'FUNCTION':
            case 'FIRST':
            case 'LAST':
                if (containAs) {
                    this.parsed.select[this.parsed.select.length - 1].alias = token[1];
                    containAs = false;
                } else {
                    this.parsed.select.push(this.parseFunction(token[1], true));
                }
                break;
            case 'DISTINCT':
                isDistinct = true;
                break;
            case 'SEPARATOR':
                break;
            default:
                this.index--;
                if (isDistinct) {
                    this.parsed.select = [{
                        type: 'distinct',
                        arguments: this.parsed.select
                    }];
                }
                return;

        }
    }
};

sql2json.prototype.parseDelete = function () {
    this.parsed.delete = true;
};

sql2json.prototype.parseFrom = function () {
    let name = '';
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'LITERAL':
                name += token[1];
                break;
            case 'NUMBER':
                name += token[1];
                break;
            case 'DOT':
            case 'MATH':
                name += token[1];
                break;
            case 'STRING':
                name += `'${token[1]}'`;
                break;
            case 'DBLSTRING':
                name += `"${token[1]}"`;
                break;
            default:
                this.parsed.from = name;
                this.index--;
                return;

        }
    }
};

sql2json.prototype.parseIn = function () {
    const stack = [];
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'LEFT_PAREN':
            case 'SEPARATOR':
                break;
            case 'STRING':
                stack.push({
                    value: `'${token[1]}'`,
                    type: 'string'
                });
                break;
            case 'NUMBER':
                stack.push({
                    value: parseFloat(token[1]),
                    type: 'number'
                });
                break;
            case 'RIGHT_PAREN':
                return stack;
            default:
                return stack;

        }
    }
};

sql2json.prototype.parseMath = function (value, first) {
    const stack = [first];
    let minus = false;
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {
            case 'MATH':
                minus = true;
                break;
            case 'LITERAL':
                stack.push({
                    value: token[1],
                    type: 'literal'
                });
                break;
            case 'NUMBER':
                stack.push({
                    value: minus ? parseFloat(token[1]) * -1 : parseFloat(token[1]),
                    type: 'number'
                });
                break;
            default:
                return stack;

        }

        if (stack.length === 2) {
            return {
                type: 'math',
                value,
                arguments: stack
            };
        }
    }
};

sql2json.prototype.parseBetween = function (between) {
    const stack = [];
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {
            case 'STRING':
                stack.push({
                    value: `'${token[1]}'`,
                    type: 'string'
                });
                break;
            case 'NUMBER':
                stack.push({
                    value: parseFloat(token[1]),
                    type: 'number'
                });
                break;
            case 'CONDITIONAL':
                break;
            default:
                return stack;

        }

        if (stack.length === 2) {
            const right = stack.pop();
            const left = stack.pop();
            return {
                type: 'between',
                value: between,
                arguments: [left, right]
            };
        }
    }
};

sql2json.prototype.parseWhere = function () {
    const stack = [];
    let operator = null;
    let conditional = null;
    let between = null;
    let minus = null;
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {
            case 'MATH_MULTI':
            case 'MATH':
                if (operator) {
                    minus = true;
                } else {
                    stack.push(this.parseMath(token[1], stack.pop()));
                }
                break;
            case 'LEFT_PAREN':
                stack.push({
                    value: this.parseWhere(),
                    type: 'bracket'
                });
                break;
            case 'RIGHT_PAREN':
                if (operator && stack.length >= 2) {
                    const right = stack.pop();
                    const left = stack.pop();
                    stack.push({
                        type: 'operator',
                        value: operator,
                        left,
                        right
                    });
                    operator = null;
                }
                if (stack.length >= 2 && conditional) {
                    const right = stack.pop();
                    const left = stack.pop();
                    stack.push({
                        type: 'conditional',
                        value: conditional,
                        left,
                        right
                    });
                    conditional = null;

                }
                return stack.pop();
                break;
            case 'LITERAL':
            case 'BOOLEAN':
                stack.push({
                    value: token[1],
                    type: 'literal'
                });
                break;
            case 'BETWEEN':
                between = stack.pop().value;
                stack.push(this.parseBetween(between));
                break;
            case 'NUMBER':
                stack.push({
                    value: minus ? -1 * parseFloat(token[1]) : parseFloat(token[1]),
                    type: 'number'
                });
                minus = false;
                break;
            case 'DBLSTRING':
                stack.push({
                    value: `"${token[1]}"`,
                    type: 'string'
                });
                break;
            case 'STRING':
                stack.push({
                    value: `'${token[1]}'`,
                    type: 'string'
                });
                break;
            case 'OPERATOR':
                operator = token[1];
                break;
            case 'SUB_SELECT_OP':
                stack.push({
                    type: 'in',
                    value: stack.pop().value,
                    arguments: this.parseIn()
                });
                break;
            case 'FUNCTION':
            case 'LAST':
            case 'FIRST':
                stack.push(this.parseFunction(token[1], false));
                break;
            case 'CONDITIONAL':
                if (operator && stack.length >= 2) {
                    const right = stack.pop();
                    const left = stack.pop();
                    stack.push({
                        type: 'operator',
                        value: operator,
                        left,
                        right
                    });
                    operator = null;
                }
                if (stack.length >= 2 && conditional) {
                    const right = stack.pop();
                    const left = stack.pop();
                    stack.push({
                        type: 'conditional',
                        value: conditional,
                        left,
                        right
                    });
                    conditional = null;

                }
                conditional = token[1];
                break;
            default:
                if (stack.length >= 2 && operator) {
                    const right = stack.pop();
                    const left = stack.pop();
                    stack.push({
                        type: 'operator',
                        value: operator,
                        left,
                        right
                    });
                    operator = null;
                }
                if (stack.length >= 2 && conditional) {
                    const right = stack.pop();
                    const left = stack.pop();
                    stack.push({
                        type: 'conditional',
                        value: conditional,
                        left,
                        right
                    });
                    conditional = null;

                }
                this.parsed.where = stack.pop();
                this.index--;
                return;

        }
    }
};
sql2json.prototype.parseWhereExperimental = function () {
    const stack = [];
    let lastParen = false;
    while (this.hasNext()) {
        const token = this.next();

        switch (obtainType(token)) {

            case 'GROUP':
            case 'ORDER':
            case 'LIMIT':
            case 'OFFSET':
            case 'EOF':
                this.parsed.where = stack.pop();
                this.index--;
                return;
            default:
                let el = null;
                if (stack.length > 0) {
                    el = stack.pop();
                    if (token[0] === 'STRING') {
                        token[1] = `'${token[1]}'`;
                    }
                    if (token[0] === 'DBLSTRING') {
                        token[1] = `"${token[1]}"`;
                    }
                    if (!lastParen && token[1] !== '(' && token[1] !== ')' && token[1] !== ',' && token[1] !== '.'  && token[1] !== '*') {
                        el.value += ' ' + token[1];
                    } else {
                        if (token[1] === '('){
                            lastParen = true;
                        } else {
                            lastParen = false;
                        }
                        el.value += token[1];
                    }
                } else  {
                    el = {
                        value: token[1],
                        alias: null,
                        type: 'literal'
                    }
                }
                stack.push(el);
        }
    }
};

sql2json.prototype.parseOrder = function () {
    const stack = [];
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'BY':
                break;
            case 'LITERAL':
            case 'FUNCTION':
                stack.push(this.parseFunction(token[1]));
                stack[stack.length - 1].direction = null;
                break;
            case 'DIRECTION':
                stack[stack.length - 1].direction = token[1];
                break;
            case 'SEPARATOR':
                break;
            case 'DBLSTRING':
                stack.push({
                    value: `"${token[1]}"`,
                    alias: null,
                    type: 'string',
                    direction: null
                });
                break;
            case 'NUMBER':
                stack.push({
                    value: parseFloat(token[1]),
                    type: 'number',
                    alias: null,
                    direction: null
                });
                break;
            case 'MATH_MULTI':
            case 'MATH':
                stack.push(this.parseMath(token[1], stack.pop()));
                break;
            default:
                this.parsed.orderBy = stack;
                this.index--;
                return;

        }
    }
};

sql2json.prototype.parseOrderExperimental = function () {
    const stack = [];
    let lastParen = false;
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'BY':
                break;

            case 'LIMIT':
            case 'OFFSET':
            case 'EOF':
            case 'GROUP':
                this.parsed.orderBy = stack;
                this.index--;
                return;
            default:
                let el = null;
                if (stack.length > 0) {
                    el = stack.pop();
                    if (token[0] === 'STRING') {
                        token[1] = `'${token[1]}'`;
                    }
                    if (token[0] === 'DBLSTRING') {
                        token[1] = `"${token[1]}"`;
                    }
                    if (!lastParen && token[1] !== '(' && token[1] !== ')' && token[1] !== ',' && token[1] !== '.'  && token[1] !== '*') {
                        el.value += ' ' + token[1];
                    } else {
                        if (token[1] === '('){
                            lastParen = true;
                        } else {
                            lastParen = false;
                        }
                        el.value += token[1];
                    }
                } else {
                    el = {
                        value: token[1],
                        alias: null,
                        type: 'literal'
                    };
                }
                stack.push(el);


        }
    }
};


sql2json.prototype.parseLimit = function () {
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'NUMBER':
                this.parsed.limit = parseInt(token[1], 10);
                return;
            default:
                return;

        }
    }
};

sql2json.prototype.parseOfsset = function () {
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'NUMBER':
                this.parsed.offset = parseInt(token[1], 10);
                return;
            default:
                return;

        }
    }
};

sql2json.prototype.parseGroup = function () {
    const stack = [];
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'BY':
            case 'SEPARATOR':
                break;
            case 'LITERAL':
                stack.push({
                    type: 'literal',
                    value: token[1]
                });
                break;
            case 'FUNCTION':
                stack.push(this.parseFunction(token[1]));
                break;
            case 'NUMBER':
                stack.push({
                    type: 'number',
                    value: parseFloat(token[1])
                });
                break;
            default:
                this.parsed.group = stack;
                this.index--;
                return;

        }
    }
};
sql2json.prototype.parseGroupExperimental = function () {
    const stack = [];
    let lastParen = false;
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'BY':
                break;
            case 'LIMIT':
            case 'OFFSET':
            case 'EOF':
            case 'ORDER':
                this.parsed.group = stack;
                this.index--;
                return;
            default:
                let el = null;
                if (stack.length > 0) {
                    el = stack.pop();
                    if (token[0] === 'STRING') {
                        token[1] = `'${token[1]}'`;
                    }
                    if (token[0] === 'DBLSTRING') {
                        token[1] = `"${token[1]}"`;
                    }
                    if (!lastParen && token[1] !== '(' && token[1] !== ')' && token[1] !== ',' && token[1] !== '.'  && token[1] !== '*') {
                        el.value += ' ' + token[1];
                    } else {
                        if (token[1] === '('){
                            lastParen = true;
                        } else {
                            lastParen = false;
                        }
                        el.value += token[1];
                    }
                } else {
                    el = {
                        value: token[1],
                        alias: null,
                        type: 'literal'
                    };
                }
                stack.push(el);

        }
    }
};

sql2json.prototype.parse = function () {
    while (this.hasNext()) {
        const token = this.next();
        switch (obtainType(token)) {

            case 'SELECT':
                if (this.experimental) {
                    this.parseSelectExperimental();
                } else {
                    this.parseSelect();
                }
                break;
            case 'DELETE':
                this.parseDelete();
                break;
            case 'FROM':
                this.parseFrom();
                break;
            case 'WHERE':
                if (this.experimental) {
                    this.parseWhereExperimental();
                } else {
                    this.parseWhere();
                }
                break;
            case 'GROUP':
                if (this.experimental) {
                    this.parseGroupExperimental();
                } else {
                    this.parseGroup();
                }
                break;
            case 'ORDER':
                if (this.experimental) {
                    this.parseOrderExperimental();
                } else {
                    this.parseOrder();
                }
                break;
            case 'LIMIT':
                this.parseLimit();
                break;
            case 'OFFSET':
                this.parseOfsset();
                break;
            case 'EOF':
                return;
            default:
                break;

        }
    }
};

sql2json.prototype.toJSON = function () {
    this.parse();
    return this.parsed;
};

module.exports = sql2json;

},{"sql-parser":5}],5:[function(require,module,exports){
sql = require('./lib/sql_parser')

for(var key in sql) {
  exports[key] = sql[key]
}


},{"./lib/sql_parser":10}],6:[function(require,module,exports){
(function (process){
/* parser generated by jison 0.4.15 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var parser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,8],$V1=[5,26],$V2=[1,14],$V3=[1,13],$V4=[5,26,31,42],$V5=[1,17],$V6=[5,26,31,42,45,62],$V7=[1,27],$V8=[1,29],$V9=[1,39],$Va=[1,43],$Vb=[1,44],$Vc=[1,40],$Vd=[1,41],$Ve=[1,38],$Vf=[1,42],$Vg=[1,25],$Vh=[5,26,31],$Vi=[5,26,31,42,45],$Vj=[1,56],$Vk=[18,43],$Vl=[1,59],$Vm=[1,60],$Vn=[1,61],$Vo=[1,62],$Vp=[1,63],$Vq=[5,18,23,26,31,34,37,38,41,42,43,45,62,64,65,66,67,68,70],$Vr=[5,18,23,26,31,34,37,38,41,42,43,44,45,51,62,64,65,66,67,68,70,71],$Vs=[1,69],$Vt=[2,83],$Vu=[1,83],$Vv=[1,84],$Vw=[1,102],$Vx=[5,26,31,42,43,44],$Vy=[1,110],$Vz=[5,26,31,42,43,45,64],$VA=[5,26,31,41,42,45,62],$VB=[1,113],$VC=[1,114],$VD=[1,115],$VE=[5,26,31,34,35,37,38,41,42,45,62],$VF=[5,18,23,26,31,34,37,38,41,42,43,45,62,64,70],$VG=[5,26,31,34,37,38,41,42,45,62],$VH=[5,26,31,42,56,58];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"Root":3,"Query":4,"EOF":5,"SelectQuery":6,"Unions":7,"SelectWithLimitQuery":8,"BasicSelectQuery":9,"Select":10,"OrderClause":11,"GroupClause":12,"LimitClause":13,"SelectClause":14,"WhereClause":15,"SELECT":16,"Fields":17,"FROM":18,"Table":19,"DISTINCT":20,"Joins":21,"Literal":22,"AS":23,"LEFT_PAREN":24,"List":25,"RIGHT_PAREN":26,"WINDOW":27,"WINDOW_FUNCTION":28,"Number":29,"Union":30,"UNION":31,"ALL":32,"Join":33,"JOIN":34,"ON":35,"Expression":36,"LEFT":37,"RIGHT":38,"INNER":39,"OUTER":40,"WHERE":41,"LIMIT":42,"SEPARATOR":43,"OFFSET":44,"ORDER":45,"BY":46,"OrderArgs":47,"OffsetClause":48,"OrderArg":49,"Value":50,"DIRECTION":51,"OffsetRows":52,"FetchClause":53,"ROW":54,"ROWS":55,"FETCH":56,"FIRST":57,"ONLY":58,"NEXT":59,"GroupBasicClause":60,"HavingClause":61,"GROUP":62,"ArgumentList":63,"HAVING":64,"MATH":65,"MATH_MULTI":66,"OPERATOR":67,"BETWEEN":68,"BetweenExpression":69,"CONDITIONAL":70,"SUB_SELECT_OP":71,"SubSelectExpression":72,"SUB_SELECT_UNARY_OP":73,"String":74,"Function":75,"UserFunction":76,"Boolean":77,"Parameter":78,"NUMBER":79,"BOOLEAN":80,"PARAMETER":81,"STRING":82,"DBLSTRING":83,"LITERAL":84,"DOT":85,"FUNCTION":86,"AggregateArgumentList":87,"Field":88,"STAR":89,"$accept":0,"$end":1},
terminals_: {2:"error",5:"EOF",16:"SELECT",18:"FROM",20:"DISTINCT",23:"AS",24:"LEFT_PAREN",26:"RIGHT_PAREN",27:"WINDOW",28:"WINDOW_FUNCTION",31:"UNION",32:"ALL",34:"JOIN",35:"ON",37:"LEFT",38:"RIGHT",39:"INNER",40:"OUTER",41:"WHERE",42:"LIMIT",43:"SEPARATOR",44:"OFFSET",45:"ORDER",46:"BY",51:"DIRECTION",54:"ROW",55:"ROWS",56:"FETCH",57:"FIRST",58:"ONLY",59:"NEXT",62:"GROUP",64:"HAVING",65:"MATH",66:"MATH_MULTI",67:"OPERATOR",68:"BETWEEN",70:"CONDITIONAL",71:"SUB_SELECT_OP",73:"SUB_SELECT_UNARY_OP",79:"NUMBER",80:"BOOLEAN",81:"PARAMETER",82:"STRING",83:"DBLSTRING",84:"LITERAL",85:"DOT",86:"FUNCTION",89:"STAR"},
productions_: [0,[3,2],[4,1],[4,2],[6,1],[6,1],[9,1],[9,2],[9,2],[9,3],[8,2],[10,1],[10,2],[14,4],[14,5],[14,5],[14,6],[19,1],[19,2],[19,3],[19,3],[19,3],[19,4],[19,6],[7,1],[7,2],[30,2],[30,3],[21,1],[21,2],[33,4],[33,5],[33,5],[33,6],[33,6],[33,6],[33,6],[15,2],[13,2],[13,4],[13,4],[11,3],[11,4],[47,1],[47,3],[49,1],[49,2],[48,2],[48,3],[52,2],[52,2],[53,4],[53,4],[12,1],[12,2],[60,3],[61,2],[36,3],[36,3],[36,3],[36,3],[36,3],[36,3],[36,5],[36,3],[36,2],[36,1],[36,1],[69,3],[72,3],[50,1],[50,1],[50,1],[50,1],[50,1],[50,1],[50,1],[25,1],[29,1],[77,1],[78,1],[74,1],[74,1],[22,1],[22,3],[75,4],[76,3],[76,4],[87,1],[87,2],[63,1],[63,3],[17,1],[17,3],[88,1],[88,1],[88,3]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1:
return this.$ = $$[$0-1];
break;
case 2: case 4: case 5: case 6: case 11: case 53: case 66: case 67: case 70: case 71: case 72: case 73: case 74: case 75: case 76:
this.$ = $$[$0];
break;
case 3:
this.$ = (function () {
        $$[$0-1].unions = $$[$0];
        return $$[$0-1];
      }());
break;
case 7:
this.$ = (function () {
        $$[$0-1].order = $$[$0];
        return $$[$0-1];
      }());
break;
case 8:
this.$ = (function () {
        $$[$0-1].group = $$[$0];
        return $$[$0-1];
      }());
break;
case 9:
this.$ = (function () {
        $$[$0-2].group = $$[$0-1];
        $$[$0-2].order = $$[$0];
        return $$[$0-2];
      }());
break;
case 10:
this.$ = (function () {
        $$[$0-1].limit = $$[$0];
        return $$[$0-1];
      }());
break;
case 12:
this.$ = (function () {
        $$[$0-1].where = $$[$0];
        return $$[$0-1];
      }());
break;
case 13:
this.$ = new yy.Select($$[$0-2], $$[$0], false);
break;
case 14:
this.$ = new yy.Select($$[$0-2], $$[$0], true);
break;
case 15:
this.$ = new yy.Select($$[$0-3], $$[$0-1], false, $$[$0]);
break;
case 16:
this.$ = new yy.Select($$[$0-3], $$[$0-1], true, $$[$0]);
break;
case 17:
this.$ = new yy.Table($$[$0]);
break;
case 18:
this.$ = new yy.Table($$[$0-1], $$[$0]);
break;
case 19:
this.$ = new yy.Table($$[$0-2], $$[$0]);
break;
case 20: case 49: case 50: case 51: case 52: case 57:
this.$ = $$[$0-1];
break;
case 21: case 69:
this.$ = new yy.SubSelect($$[$0-1]);
break;
case 22:
this.$ = new yy.SubSelect($$[$0-2], $$[$0]);
break;
case 23:
this.$ = new yy.Table($$[$0-5], null, $$[$0-4], $$[$0-3], $$[$0-1]);
break;
case 24: case 28: case 43: case 90: case 92:
this.$ = [$$[$0]];
break;
case 25:
this.$ = $$[$0-1].concat($$[$01]);
break;
case 26:
this.$ = new yy.Union($$[$0]);
break;
case 27:
this.$ = new yy.Union($$[$0], true);
break;
case 29:
this.$ = $$[$0-1].concat($$[$0]);
break;
case 30:
this.$ = new yy.Join($$[$0-2], $$[$0]);
break;
case 31:
this.$ = new yy.Join($$[$0-2], $$[$0], 'LEFT');
break;
case 32:
this.$ = new yy.Join($$[$0-2], $$[$0], 'RIGHT');
break;
case 33:
this.$ = new yy.Join($$[$0-2], $$[$0], 'LEFT', 'INNER');
break;
case 34:
this.$ = new yy.Join($$[$0-2], $$[$0], 'RIGHT', 'INNER');
break;
case 35:
this.$ = new yy.Join($$[$0-2], $$[$0], 'LEFT', 'OUTER');
break;
case 36:
this.$ = new yy.Join($$[$0-2], $$[$0], 'RIGHT', 'OUTER');
break;
case 37:
this.$ = new yy.Where($$[$0]);
break;
case 38:
this.$ = new yy.Limit($$[$0]);
break;
case 39:
this.$ = new yy.Limit($$[$0], $$[$0-2]);
break;
case 40:
this.$ = new yy.Limit($$[$0-2], $$[$0]);
break;
case 41:
this.$ = new yy.Order($$[$0]);
break;
case 42:
this.$ = new yy.Order($$[$0-1], $$[$0]);
break;
case 44: case 91: case 93:
this.$ = $$[$0-2].concat($$[$0]);
break;
case 45:
this.$ = new yy.OrderArgument($$[$0], 'ASC');
break;
case 46:
this.$ = new yy.OrderArgument($$[$0-1], $$[$0]);
break;
case 47:
this.$ = new yy.Offset($$[$0]);
break;
case 48:
this.$ = new yy.Offset($$[$0-1], $$[$0]);
break;
case 54:
this.$ = (function () {
        $$[$0-1].having = $$[$0];
        return $$[$0-1];
      }());
break;
case 55:
this.$ = new yy.Group($$[$0]);
break;
case 56:
this.$ = new yy.Having($$[$0]);
break;
case 58: case 59: case 60: case 61: case 62: case 64:
this.$ = new yy.Op($$[$0-1], $$[$0-2], $$[$0]);
break;
case 63:
this.$ = new yy.Op($$[$0-3], $$[$0-4], $$[$0-1]);
break;
case 65:
this.$ = new yy.UnaryOp($$[$0-1], $$[$0]);
break;
case 68:
this.$ = new yy.BetweenOp([$$[$0-2], $$[$0]]);
break;
case 77:
this.$ = new yy.ListValue($$[$0]);
break;
case 78:
this.$ = new yy.NumberValue($$[$0]);
break;
case 79:
this.$ = new yy.BooleanValue($$[$0]);
break;
case 80:
this.$ = new yy.ParameterValue($$[$0]);
break;
case 81:
this.$ = new yy.StringValue($$[$0], "'");
break;
case 82:
this.$ = new yy.StringValue($$[$0], '"');
break;
case 83:
this.$ = new yy.LiteralValue($$[$0]);
break;
case 84:
this.$ = new yy.LiteralValue($$[$0-2], $$[$0]);
break;
case 85:
this.$ = new yy.FunctionValue($$[$0-3], $$[$0-1]);
break;
case 86:
this.$ = new yy.FunctionValue($$[$0-2], null, true);
break;
case 87:
this.$ = new yy.FunctionValue($$[$0-3], $$[$0-1], true);
break;
case 88:
this.$ = new yy.ArgumentListValue($$[$0]);
break;
case 89:
this.$ = new yy.ArgumentListValue($$[$0], true);
break;
case 94:
this.$ = new yy.Star();
break;
case 95:
this.$ = new yy.Field($$[$0]);
break;
case 96:
this.$ = new yy.Field($$[$0-2], $$[$0]);
break;
}
},
table: [{3:1,4:2,6:3,8:4,9:5,10:6,14:7,16:$V0},{1:[3]},{5:[1,9]},o($V1,[2,2],{7:10,13:11,30:12,31:$V2,42:$V3}),o($V4,[2,4]),o($V4,[2,5]),o($V4,[2,6],{11:15,12:16,60:18,45:$V5,62:[1,19]}),o($V6,[2,11],{15:20,41:[1,21]}),{17:22,20:[1,23],22:31,24:$V7,29:32,36:26,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf,88:24,89:$Vg},{1:[2,1]},o($V1,[2,3],{30:45,31:$V2}),o($V4,[2,10]),o($Vh,[2,24]),{29:46,79:$V9},{6:47,8:4,9:5,10:6,14:7,16:$V0,32:[1,48]},o($V4,[2,7]),o($V4,[2,8],{11:49,45:$V5}),{46:[1,50]},o($Vi,[2,53],{61:51,64:[1,52]}),{46:[1,53]},o($V6,[2,12]),{22:31,24:$V7,29:32,36:54,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{18:[1,55],43:$Vj},{17:57,22:31,24:$V7,29:32,36:26,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf,88:24,89:$Vg},o($Vk,[2,92]),o($Vk,[2,94]),o($Vk,[2,95],{23:[1,58],65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),{4:65,6:3,8:4,9:5,10:6,14:7,16:$V0,22:31,24:$V7,29:32,36:64,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},o($Vq,[2,67],{71:[1,66]}),{24:[1,68],72:67},o($Vq,[2,66]),o($Vr,[2,70],{85:$Vs}),o($Vr,[2,71]),o($Vr,[2,72]),o($Vr,[2,73]),o($Vr,[2,74]),o($Vr,[2,75]),o($Vr,[2,76]),o([5,18,23,26,31,34,37,38,41,42,43,44,45,51,62,64,65,66,67,68,70,71,85],$Vt,{24:[1,70]}),o([5,18,23,26,31,34,37,38,41,42,43,44,45,51,54,55,62,64,65,66,67,68,70,71],[2,78]),o($Vr,[2,81]),o($Vr,[2,82]),{24:[1,71]},o($Vr,[2,79]),o($Vr,[2,80]),o($Vh,[2,25]),o($V4,[2,38],{43:[1,72],44:[1,73]}),o($Vh,[2,26],{13:11,42:$V3}),{6:74,8:4,9:5,10:6,14:7,16:$V0},o($V4,[2,9]),{22:31,29:32,47:75,49:76,50:77,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},o($Vi,[2,54]),{22:31,24:$V7,29:32,36:78,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{22:31,24:$V7,29:32,36:80,50:28,63:79,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},o($V6,[2,37],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),{19:81,22:82,24:$Vu,84:$Vv},{22:31,24:$V7,29:32,36:26,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf,88:85,89:$Vg},{18:[1,86],43:$Vj},{22:87,84:$Vv},{22:31,24:$V7,29:32,36:88,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{22:31,24:$V7,29:32,36:89,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{22:31,24:$V7,29:32,36:90,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{22:31,24:$V7,29:32,36:92,50:28,69:91,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{22:31,24:$V7,29:32,36:93,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{26:[1,94],65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp},{26:[1,95]},{24:[1,96],72:97},o($Vq,[2,65]),{4:65,6:3,8:4,9:5,10:6,14:7,16:$V0},{84:[1,98]},{20:$Vw,22:31,24:$V7,26:[1,99],29:32,36:80,50:28,63:101,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf,87:100},{20:$Vw,22:31,24:$V7,29:32,36:80,50:28,63:101,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf,87:103},{29:104,79:$V9},{29:105,79:$V9},o($Vh,[2,27],{13:11,42:$V3}),o($V4,[2,41],{48:106,43:[1,107],44:[1,108]}),o($Vx,[2,43]),o($Vx,[2,45],{51:[1,109]}),o($Vi,[2,56],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),o([5,26,31,42,45,64],[2,55],{43:$Vy}),o($Vz,[2,90],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),o($VA,[2,13],{21:111,33:112,34:$VB,37:$VC,38:$VD}),o($VE,[2,17],{22:116,23:[1,117],27:[1,118],84:$Vv,85:$Vs}),{4:120,6:3,8:4,9:5,10:6,14:7,16:$V0,22:31,24:$V7,25:119,29:32,36:80,50:28,63:121,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},o([5,18,23,26,27,31,34,35,37,38,41,42,43,45,62,84,85],$Vt),o($Vk,[2,93]),{19:122,22:82,24:$Vu,84:$Vv},o($Vk,[2,96],{85:$Vs}),o([5,18,23,26,31,34,37,38,41,42,43,45,62,64,65,67,70],[2,58],{66:$Vm,68:$Vo}),o([5,18,23,26,31,34,37,38,41,42,43,45,62,64,65,66,67,70],[2,59],{68:$Vo}),o([5,18,23,26,31,34,37,38,41,42,43,45,62,64,67,70],[2,60],{65:$Vl,66:$Vm,68:$Vo}),o($Vq,[2,61]),{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:[1,123]},o($VF,[2,62],{65:$Vl,66:$Vm,67:$Vn,68:$Vo}),o($Vq,[2,57]),o($Vq,[2,69]),{4:65,6:3,8:4,9:5,10:6,14:7,16:$V0,22:31,24:$V7,25:124,29:32,36:80,50:28,63:121,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},o($Vq,[2,64]),o([5,18,23,26,27,31,34,35,37,38,41,42,43,44,45,51,62,64,65,66,67,68,70,71,84,85],[2,84]),o($Vr,[2,86]),{26:[1,125]},{26:[2,88],43:$Vy},{22:31,24:$V7,29:32,36:80,50:28,63:126,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{26:[1,127]},o($V4,[2,39]),o($V4,[2,40]),o($V4,[2,42]),{22:31,29:32,49:128,50:77,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{29:130,52:129,79:$V9},o($Vx,[2,46]),{22:31,29:32,50:131,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},o($VA,[2,15],{33:132,34:$VB,37:$VC,38:$VD}),o($VG,[2,28]),{19:133,22:82,24:$Vu,84:$Vv},{34:[1,134],39:[1,135],40:[1,136]},{34:[1,137],39:[1,138],40:[1,139]},o($VE,[2,18],{85:$Vs}),{22:140,84:$Vv},{28:[1,141]},{26:[1,142]},{26:[1,143]},{26:[2,77],43:$Vy},o($VA,[2,14],{33:112,21:144,34:$VB,37:$VC,38:$VD}),{22:31,24:$V7,29:32,36:145,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{26:[1,146]},o($Vr,[2,87]),{26:[2,89],43:$Vy},o($Vr,[2,85]),o($Vx,[2,44]),o($V4,[2,47],{53:147,56:[1,148]}),{54:[1,149],55:[1,150]},o($Vz,[2,91]),o($VG,[2,29]),{35:[1,151]},{19:152,22:82,24:$Vu,84:$Vv},{34:[1,153]},{34:[1,154]},{19:155,22:82,24:$Vu,84:$Vv},{34:[1,156]},{34:[1,157]},o($VE,[2,19],{85:$Vs}),{24:[1,158]},o($VE,[2,20]),o($VE,[2,21],{22:159,84:$Vv}),o($VA,[2,16],{33:132,34:$VB,37:$VC,38:$VD}),o($VF,[2,68],{65:$Vl,66:$Vm,67:$Vn,68:$Vo}),o($Vq,[2,63]),o($V4,[2,48]),{57:[1,160],59:[1,161]},o($VH,[2,49]),o($VH,[2,50]),{22:31,24:$V7,29:32,36:162,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{35:[1,163]},{19:164,22:82,24:$Vu,84:$Vv},{19:165,22:82,24:$Vu,84:$Vv},{35:[1,166]},{19:167,22:82,24:$Vu,84:$Vv},{19:168,22:82,24:$Vu,84:$Vv},{29:169,79:$V9},o($VE,[2,22],{85:$Vs}),{29:130,52:170,79:$V9},{29:130,52:171,79:$V9},o($VG,[2,30],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),{22:31,24:$V7,29:32,36:172,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{35:[1,173]},{35:[1,174]},{22:31,24:$V7,29:32,36:175,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{35:[1,176]},{35:[1,177]},{26:[1,178]},{58:[1,179]},{58:[1,180]},o($VG,[2,31],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),{22:31,24:$V7,29:32,36:181,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{22:31,24:$V7,29:32,36:182,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},o($VG,[2,32],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),{22:31,24:$V7,29:32,36:183,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},{22:31,24:$V7,29:32,36:184,50:28,72:30,73:$V8,74:33,75:34,76:35,77:36,78:37,79:$V9,80:$Va,81:$Vb,82:$Vc,83:$Vd,84:$Ve,86:$Vf},o($VE,[2,23]),o($V4,[2,51]),o($V4,[2,52]),o($VG,[2,33],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),o($VG,[2,35],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),o($VG,[2,34],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp}),o($VG,[2,36],{65:$Vl,66:$Vm,67:$Vn,68:$Vo,70:$Vp})],
defaultActions: {9:[2,1]},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        throw new Error(str);
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        function lex() {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};

function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}
}).call(this,require('_process'))
},{"_process":13,"fs":11,"path":12}],7:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
(function() {
  var Lexer;

  Lexer = (function() {
    var BOOLEAN, DBLSTRING, LITERAL, MATH, MATH_MULTI, NUMBER, PARAMETER, SEPARATOR, SQL_BETWEENS, SQL_CONDITIONALS, SQL_FUNCTIONS, SQL_OPERATORS, SQL_SORT_ORDERS, STAR, STRING, SUB_SELECT_OP, SUB_SELECT_UNARY_OP, WHITESPACE;

    function Lexer(sql, opts) {
      var bytesConsumed, i;
      if (opts == null) {
        opts = {};
      }
      this.sql = sql;
      this.preserveWhitespace = opts.preserveWhitespace || false;
      this.tokens = [];
      this.currentLine = 1;
      i = 0;
      while (this.chunk = sql.slice(i)) {
        bytesConsumed = this.keywordToken() || this.starToken() || this.booleanToken() || this.functionToken() || this.windowExtension() || this.sortOrderToken() || this.seperatorToken() || this.operatorToken() || this.mathToken() || this.dotToken() || this.conditionalToken() || this.betweenToken() || this.subSelectOpToken() || this.subSelectUnaryOpToken() || this.numberToken() || this.stringToken() || this.parameterToken() || this.parensToken() || this.whitespaceToken() || this.literalToken();
        if (bytesConsumed < 1) {
          throw new Error("NOTHING CONSUMED: Stopped at - '" + (this.chunk.slice(0, 30)) + "'");
        }
        i += bytesConsumed;
      }
      this.token('EOF', '');
      this.postProcess();
    }

    Lexer.prototype.postProcess = function() {
      var i, next_token, token, _i, _len, _ref, _results;
      _ref = this.tokens;
      _results = [];
      for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
        token = _ref[i];
        if (token[0] === 'STAR') {
          next_token = this.tokens[i + 1];
          if (!(next_token[0] === 'SEPARATOR' || next_token[0] === 'FROM')) {
            _results.push(token[0] = 'MATH_MULTI');
          } else {
            _results.push(void 0);
          }
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    };

    Lexer.prototype.token = function(name, value) {
      return this.tokens.push([name, value, this.currentLine]);
    };

    Lexer.prototype.tokenizeFromRegex = function(name, regex, part, lengthPart, output) {
      var match, partMatch;
      if (part == null) {
        part = 0;
      }
      if (lengthPart == null) {
        lengthPart = part;
      }
      if (output == null) {
        output = true;
      }
      if (!(match = regex.exec(this.chunk))) {
        return 0;
      }
      partMatch = match[part];
      if (output) {
        this.token(name, partMatch);
      }
      return match[lengthPart].length;
    };

    Lexer.prototype.tokenizeFromWord = function(name, word) {
      var match, matcher;
      if (word == null) {
        word = name;
      }
      word = this.regexEscape(word);
      matcher = /^\w+$/.test(word) ? new RegExp("^(" + word + ")\\b", 'ig') : new RegExp("^(" + word + ")", 'ig');
      match = matcher.exec(this.chunk);
      if (!match) {
        return 0;
      }
      this.token(name, match[1]);
      return match[1].length;
    };

    Lexer.prototype.tokenizeFromList = function(name, list) {
      var entry, ret, _i, _len;
      ret = 0;
      for (_i = 0, _len = list.length; _i < _len; _i++) {
        entry = list[_i];
        ret = this.tokenizeFromWord(name, entry);
        if (ret > 0) {
          break;
        }
      }
      return ret;
    };

    Lexer.prototype.keywordToken = function() {
      return this.tokenizeFromWord('SELECT') || this.tokenizeFromWord('DISTINCT') || this.tokenizeFromWord('FROM') || this.tokenizeFromWord('WHERE') || this.tokenizeFromWord('GROUP') || this.tokenizeFromWord('ORDER') || this.tokenizeFromWord('BY') || this.tokenizeFromWord('HAVING') || this.tokenizeFromWord('LIMIT') || this.tokenizeFromWord('JOIN') || this.tokenizeFromWord('LEFT') || this.tokenizeFromWord('RIGHT') || this.tokenizeFromWord('INNER') || this.tokenizeFromWord('OUTER') || this.tokenizeFromWord('ON') || this.tokenizeFromWord('AS') || this.tokenizeFromWord('UNION') || this.tokenizeFromWord('ALL') || this.tokenizeFromWord('LIMIT') || this.tokenizeFromWord('OFFSET') || this.tokenizeFromWord('FETCH') || this.tokenizeFromWord('ROW') || this.tokenizeFromWord('ROWS') || this.tokenizeFromWord('ONLY') || this.tokenizeFromWord('NEXT') || this.tokenizeFromWord('FIRST');
    };

    Lexer.prototype.dotToken = function() {
      return this.tokenizeFromWord('DOT', '.');
    };

    Lexer.prototype.operatorToken = function() {
      return this.tokenizeFromList('OPERATOR', SQL_OPERATORS);
    };

    Lexer.prototype.mathToken = function() {
      return this.tokenizeFromList('MATH', MATH) || this.tokenizeFromList('MATH_MULTI', MATH_MULTI);
    };

    Lexer.prototype.conditionalToken = function() {
      return this.tokenizeFromList('CONDITIONAL', SQL_CONDITIONALS);
    };

    Lexer.prototype.betweenToken = function() {
      return this.tokenizeFromList('BETWEEN', SQL_BETWEENS);
    };

    Lexer.prototype.subSelectOpToken = function() {
      return this.tokenizeFromList('SUB_SELECT_OP', SUB_SELECT_OP);
    };

    Lexer.prototype.subSelectUnaryOpToken = function() {
      return this.tokenizeFromList('SUB_SELECT_UNARY_OP', SUB_SELECT_UNARY_OP);
    };

    Lexer.prototype.functionToken = function() {
      return this.tokenizeFromList('FUNCTION', SQL_FUNCTIONS);
    };

    Lexer.prototype.sortOrderToken = function() {
      return this.tokenizeFromList('DIRECTION', SQL_SORT_ORDERS);
    };

    Lexer.prototype.booleanToken = function() {
      return this.tokenizeFromList('BOOLEAN', BOOLEAN);
    };

    Lexer.prototype.starToken = function() {
      return this.tokenizeFromRegex('STAR', STAR);
    };

    Lexer.prototype.seperatorToken = function() {
      return this.tokenizeFromRegex('SEPARATOR', SEPARATOR);
    };

    Lexer.prototype.literalToken = function() {
      return this.tokenizeFromRegex('LITERAL', LITERAL, 1, 0);
    };

    Lexer.prototype.numberToken = function() {
      return this.tokenizeFromRegex('NUMBER', NUMBER);
    };

    Lexer.prototype.parameterToken = function() {
      return this.tokenizeFromRegex('PARAMETER', PARAMETER);
    };

    Lexer.prototype.stringToken = function() {
      return this.tokenizeFromRegex('STRING', STRING, 1, 0) || this.tokenizeFromRegex('DBLSTRING', DBLSTRING, 1, 0);
    };

    Lexer.prototype.parensToken = function() {
      return this.tokenizeFromRegex('LEFT_PAREN', /^\(/) || this.tokenizeFromRegex('RIGHT_PAREN', /^\)/);
    };

    Lexer.prototype.windowExtension = function() {
      var match;
      match = /^\.(win):(length|time)/i.exec(this.chunk);
      if (!match) {
        return 0;
      }
      this.token('WINDOW', match[1]);
      this.token('WINDOW_FUNCTION', match[2]);
      return match[0].length;
    };

    Lexer.prototype.whitespaceToken = function() {
      var match, newlines, partMatch;
      if (!(match = WHITESPACE.exec(this.chunk))) {
        return 0;
      }
      partMatch = match[0];
      newlines = partMatch.replace(/[^\n]/, '').length;
      this.currentLine += newlines;
      if (this.preserveWhitespace) {
        this.token(name, partMatch);
      }
      return partMatch.length;
    };

    Lexer.prototype.regexEscape = function(str) {
      return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    };

    SQL_FUNCTIONS = ['AVG', 'COUNT', 'MIN', 'MAX', 'SUM'];

    SQL_SORT_ORDERS = ['ASC', 'DESC'];

    SQL_OPERATORS = ['=', '!=', '>=', '>', '<=', '<>', '<', 'LIKE', 'IS NOT', 'IS'];

    SUB_SELECT_OP = ['IN', 'NOT IN', 'ANY', 'ALL', 'SOME'];

    SUB_SELECT_UNARY_OP = ['EXISTS'];

    SQL_CONDITIONALS = ['AND', 'OR'];

    SQL_BETWEENS = ['BETWEEN', 'NOT BETWEEN'];

    BOOLEAN = ['TRUE', 'FALSE', 'NULL'];

    MATH = ['+', '-'];

    MATH_MULTI = ['/', '*'];

    STAR = /^\*/;

    SEPARATOR = /^,/;

    WHITESPACE = /^[ \n\r]+/;

    LITERAL = /^`?([a-z0-9_\-\[\]\.-][a-z0-9_:\-\[\]\.-]{0,})`?/i;

    PARAMETER = /^\$[0-9]+/;

    NUMBER = /^[0-9]+(\.[0-9]+)?/;

    STRING = /^'([^\\']*(?:\\.[^\\']*)*)'/;

    DBLSTRING = /^"([^\\"]*(?:\\.[^\\"]*)*)"/;

    return Lexer;

  })();

  exports.tokenize = function(sql, opts) {
    return (new Lexer(sql, opts)).tokens;
  };

}).call(this);

},{}],8:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
(function() {
  var ArgumentListValue, BetweenOp, Field, FunctionValue, Group, Having, Join, Limit, ListValue, LiteralValue, Offset, Op, Order, OrderArgument, ParameterValue, Select, Star, StringValue, SubSelect, Table, UnaryOp, Union, Where, indent;

  indent = function(str) {
    var line;
    return ((function() {
      var _i, _len, _ref, _results;
      _ref = str.split("\n");
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        line = _ref[_i];
        _results.push("  " + line);
      }
      return _results;
    })()).join("\n");
  };

  exports.Select = Select = (function() {
    function Select(fields, source, distinct, joins, unions) {
      this.fields = fields;
      this.source = source;
      this.distinct = distinct != null ? distinct : false;
      this.joins = joins != null ? joins : [];
      this.unions = unions != null ? unions : [];
      this.order = null;
      this.group = null;
      this.where = null;
      this.limit = null;
    }

    Select.prototype.toString = function() {
      var join, ret, union, _i, _j, _len, _len1, _ref, _ref1;
      ret = ["SELECT " + (this.fields.join(', '))];
      ret.push(indent("FROM " + this.source));
      _ref = this.joins;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        join = _ref[_i];
        ret.push(indent(join.toString()));
      }
      if (this.where) {
        ret.push(indent(this.where.toString()));
      }
      if (this.group) {
        ret.push(indent(this.group.toString()));
      }
      if (this.order) {
        ret.push(indent(this.order.toString()));
      }
      if (this.limit) {
        ret.push(indent(this.limit.toString()));
      }
      _ref1 = this.unions;
      for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
        union = _ref1[_j];
        ret.push(union.toString());
      }
      return ret.join("\n");
    };

    return Select;

  })();

  exports.SubSelect = SubSelect = (function() {
    function SubSelect(select, name) {
      this.select = select;
      this.name = name != null ? name : null;
      null;
    }

    SubSelect.prototype.toString = function() {
      var ret;
      ret = [];
      ret.push('(');
      ret.push(indent(this.select.toString()));
      ret.push(this.name ? ") " + (this.name.toString()) : ")");
      return ret.join("\n");
    };

    return SubSelect;

  })();

  exports.Join = Join = (function() {
    function Join(right, conditions, side, mode) {
      this.right = right;
      this.conditions = conditions != null ? conditions : null;
      this.side = side != null ? side : null;
      this.mode = mode != null ? mode : null;
      null;
    }

    Join.prototype.toString = function() {
      var ret;
      ret = '';
      if (this.side != null) {
        ret += "" + this.side + " ";
      }
      if (this.mode != null) {
        ret += "" + this.mode + " ";
      }
      return ret + ("JOIN " + this.right + "\n") + indent("ON " + this.conditions);
    };

    return Join;

  })();

  exports.Union = Union = (function() {
    function Union(query, all) {
      this.query = query;
      this.all = all != null ? all : false;
      null;
    }

    Union.prototype.toString = function() {
      var all;
      all = this.all ? ' ALL' : '';
      return "UNION" + all + "\n" + (this.query.toString());
    };

    return Union;

  })();

  exports.LiteralValue = LiteralValue = (function() {
    function LiteralValue(value, value2) {
      this.value = value;
      this.value2 = value2 != null ? value2 : null;
      if (this.value2) {
        this.nested = true;
        this.values = this.value.values;
        this.values.push(value2);
      } else {
        this.nested = false;
        this.values = [this.value];
      }
    }

    LiteralValue.prototype.toString = function() {
      return "`" + (this.values.join('.')) + "`";
    };

    return LiteralValue;

  })();

  exports.StringValue = StringValue = (function() {
    function StringValue(value, quoteType) {
      this.value = value;
      this.quoteType = quoteType != null ? quoteType : "''";
      null;
    }

    StringValue.prototype.toString = function() {
      return "" + this.quoteType + this.value + this.quoteType;
    };

    return StringValue;

  })();

  exports.NumberValue = LiteralValue = (function() {
    function LiteralValue(value) {
      this.value = Number(value);
    }

    LiteralValue.prototype.toString = function() {
      return this.value.toString();
    };

    return LiteralValue;

  })();

  exports.ListValue = ListValue = (function() {
    function ListValue(value) {
      this.value = value;
    }

    ListValue.prototype.toString = function() {
      return "(" + (this.value.join(', ')) + ")";
    };

    return ListValue;

  })();

  exports.ParameterValue = ParameterValue = (function() {
    function ParameterValue(value) {
      this.value = value;
      this.index = parseInt(value.substr(1), 10) - 1;
    }

    ParameterValue.prototype.toString = function() {
      return "" + this.value;
    };

    return ParameterValue;

  })();

  exports.ArgumentListValue = ArgumentListValue = (function() {
    function ArgumentListValue(value, distinct) {
      this.value = value;
      this.distinct = distinct != null ? distinct : false;
      null;
    }

    ArgumentListValue.prototype.toString = function() {
      if (this.distinct) {
        return "DISTINCT " + (this.value.join(', '));
      } else {
        return "" + (this.value.join(', '));
      }
    };

    return ArgumentListValue;

  })();

  exports.BooleanValue = LiteralValue = (function() {
    function LiteralValue(value) {
      this.value = (function() {
        switch (value.toLowerCase()) {
          case 'true':
            return true;
          case 'false':
            return false;
          default:
            return null;
        }
      })();
    }

    LiteralValue.prototype.toString = function() {
      if (this.value != null) {
        return this.value.toString().toUpperCase();
      } else {
        return 'NULL';
      }
    };

    return LiteralValue;

  })();

  exports.FunctionValue = FunctionValue = (function() {
    function FunctionValue(name, _arguments, udf) {
      this.name = name;
      this["arguments"] = _arguments != null ? _arguments : null;
      this.udf = udf != null ? udf : false;
      null;
    }

    FunctionValue.prototype.toString = function() {
      if (this["arguments"]) {
        return "" + (this.name.toUpperCase()) + "(" + (this["arguments"].toString()) + ")";
      } else {
        return "" + (this.name.toUpperCase()) + "()";
      }
    };

    return FunctionValue;

  })();

  exports.Order = Order = (function() {
    function Order(orderings, offset) {
      this.orderings = orderings;
      this.offset = offset;
    }

    Order.prototype.toString = function() {
      return ("ORDER BY " + (this.orderings.join(', '))) + (this.offset ? "\n" + this.offset.toString() : "");
    };

    return Order;

  })();

  exports.OrderArgument = OrderArgument = (function() {
    function OrderArgument(value, direction) {
      this.value = value;
      this.direction = direction != null ? direction : 'ASC';
      null;
    }

    OrderArgument.prototype.toString = function() {
      return "" + this.value + " " + this.direction;
    };

    return OrderArgument;

  })();

  exports.Offset = Offset = (function() {
    function Offset(row_count, limit) {
      this.row_count = row_count;
      this.limit = limit;
      null;
    }

    Offset.prototype.toString = function() {
      return ("OFFSET " + this.row_count + " ROWS") + (this.limit ? "\nFETCH NEXT " + this.limit + " ROWS ONLY" : "");
    };

    return Offset;

  })();

  exports.Limit = Limit = (function() {
    function Limit(value, offset) {
      this.value = value;
      this.offset = offset;
      null;
    }

    Limit.prototype.toString = function() {
      return ("LIMIT " + this.value) + (this.offset ? "\nOFFSET " + this.offset : "");
    };

    return Limit;

  })();

  exports.Table = Table = (function() {
    function Table(name, alias, win, winFn, winArg) {
      this.name = name;
      this.alias = alias != null ? alias : null;
      this.win = win != null ? win : null;
      this.winFn = winFn != null ? winFn : null;
      this.winArg = winArg != null ? winArg : null;
      null;
    }

    Table.prototype.toString = function() {
      if (this.win) {
        return "" + this.name + "." + this.win + ":" + this.winFn + "(" + this.winArg + ")";
      } else if (this.alias) {
        return "" + this.name + " AS " + this.alias;
      } else {
        return this.name.toString();
      }
    };

    return Table;

  })();

  exports.Group = Group = (function() {
    function Group(fields) {
      this.fields = fields;
      this.having = null;
    }

    Group.prototype.toString = function() {
      var ret;
      ret = ["GROUP BY " + (this.fields.join(', '))];
      if (this.having) {
        ret.push(this.having.toString());
      }
      return ret.join("\n");
    };

    return Group;

  })();

  exports.Where = Where = (function() {
    function Where(conditions) {
      this.conditions = conditions;
      null;
    }

    Where.prototype.toString = function() {
      return "WHERE " + this.conditions;
    };

    return Where;

  })();

  exports.Having = Having = (function() {
    function Having(conditions) {
      this.conditions = conditions;
      null;
    }

    Having.prototype.toString = function() {
      return "HAVING " + this.conditions;
    };

    return Having;

  })();

  exports.Op = Op = (function() {
    function Op(operation, left, right) {
      this.operation = operation;
      this.left = left;
      this.right = right;
      null;
    }

    Op.prototype.toString = function() {
      return "(" + this.left + " " + (this.operation.toUpperCase()) + " " + this.right + ")";
    };

    return Op;

  })();

  exports.UnaryOp = UnaryOp = (function() {
    function UnaryOp(operator, operand) {
      this.operator = operator;
      this.operand = operand;
      null;
    }

    UnaryOp.prototype.toString = function() {
      return "(" + (this.operator.toUpperCase()) + " " + this.operand + ")";
    };

    return UnaryOp;

  })();

  exports.BetweenOp = BetweenOp = (function() {
    function BetweenOp(value) {
      this.value = value;
      null;
    }

    BetweenOp.prototype.toString = function() {
      return "" + (this.value.join(' AND '));
    };

    return BetweenOp;

  })();

  exports.Field = Field = (function() {
    function Field(field, name) {
      this.field = field;
      this.name = name != null ? name : null;
      null;
    }

    Field.prototype.toString = function() {
      if (this.name) {
        return "" + this.field + " AS " + this.name;
      } else {
        return this.field.toString();
      }
    };

    return Field;

  })();

  exports.Star = Star = (function() {
    function Star() {
      null;
    }

    Star.prototype.toString = function() {
      return '*';
    };

    Star.prototype.star = true;

    return Star;

  })();

}).call(this);

},{}],9:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
(function() {
  var buildParser;

  buildParser = function() {
    var parser;
    parser = require('./compiled_parser').parser;
    parser.lexer = {
      lex: function() {
        var tag, _ref;
        _ref = this.tokens[this.pos++] || [''], tag = _ref[0], this.yytext = _ref[1], this.yylineno = _ref[2];
        return tag;
      },
      setInput: function(tokens) {
        this.tokens = tokens;
        return this.pos = 0;
      },
      upcomingInput: function() {
        return "";
      }
    };
    parser.yy = require('./nodes');
    return parser;
  };

  exports.parser = buildParser();

  exports.parse = function(str) {
    return buildParser().parse(str);
  };

}).call(this);

},{"./compiled_parser":6,"./nodes":8}],10:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
(function() {
  exports.lexer = require('./lexer');

  exports.parser = require('./parser');

  exports.nodes = require('./nodes');

  exports.parse = function(sql) {
    return exports.parser.parse(exports.lexer.tokenize(sql));
  };

}).call(this);

},{"./lexer":7,"./nodes":8,"./parser":9}],11:[function(require,module,exports){

},{}],12:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":13}],13:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[1]);
