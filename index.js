//import sql2json from 'sql2json'
const sql2json = require('sql2json');

const Sql2json = sql2json.sql2json;
obj = new Sql2json('SELECT * FROM tablename WHERE a > 2 and b < 3 or c = 2');
console.log(obj.toJSON());