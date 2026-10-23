import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze,project,parseCSV,validateHolding} from './engine.js';
test('rebalanceamento conserva patrimônio mais aporte',()=>{const r=analyze([{name:'Reserva',category:'Caixa',value:1000}],'Moderado',250);assert.equal(r.total,1000);assert.ok(Math.abs(r.allocation.reduce((s,a)=>s+a.delta,0)-250)<1e-8);assert.equal(r.allocation.find(a=>a.category==='Renda fixa').delta,500);});
test('concentração agrega posições com o mesmo nome',()=>{const r=analyze([{name:'Ativo',category:'Ações',value:200},{name:'ativo',category:'Ações',value:300},{name:'Outro',category:'Exterior',value:500}],'Moderado');assert.equal(r.concentration,50);});
test('carteira vazia não produz NaN',()=>{const r=analyze([],'Conservador');assert.equal(r.concentration,0);assert.equal(r.drift,0);assert.ok(r.allocation.every(a=>a.delta===0));});
test('projeção sem juros e com juros compostos',()=>{assert.equal(project(1000,100,1,0).balance,2200);assert.ok(Math.abs(project(1000,0,1,12).balance-1120)<1e-8);assert.throws(()=>project(0,0,1.5,6));});
test('CSV aceita decimal brasileiro e rejeita arquivo parcialmente inválido',()=>{assert.equal(parseCSV('nome;classe;valor\nReserva;Caixa;100,50')[0].value,100.5);assert.throws(()=>parseCSV('nome;classe;valor\nBom;Caixa;100\nRuim;Ações;abc'));assert.throws(()=>parseCSV('nome;classe;valor\nX;Caixa;1.000,00'));});
test('validação rejeita valores não finitos e negativos',()=>{for(const value of [NaN,Infinity,-1,0])assert.throws(()=>validateHolding({name:'Teste',category:'Caixa',value}));assert.throws(()=>analyze([],'Inválido'));assert.throws(()=>analyze([],'Moderado',-1));});
