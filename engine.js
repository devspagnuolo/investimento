export const classes = ['Renda fixa', 'Ações', 'FIIs', 'Exterior', 'Caixa'];
export const profiles = {
  Conservador: [65, 5, 5, 10, 15],
  Moderado: [40, 20, 10, 20, 10],
  Arrojado: [20, 35, 15, 25, 5],
};
export function validateHolding(h) {
  if (typeof h?.name !== 'string' || !h.name.trim() || h.name.length > 80) throw Error('Informe um nome com até 80 caracteres.');
  if (!classes.includes(h.category)) throw Error('Classe de ativo inválida.');
  if (!Number.isFinite(h.value) || h.value <= 0 || h.value > 1e12) throw Error('Valor deve ser maior que zero e até R$ 1 trilhão.');
  return {name: h.name.trim(), category:h.category, value:h.value};
}
export function analyze(holdings, profile, contribution = 0) {
  if (!profiles[profile]) throw Error('Perfil inválido.');
  if (!Number.isFinite(contribution) || contribution < 0 || contribution > 1e12) throw Error('Aporte inválido.');
  const clean = holdings.map(validateHolding);
  const total = clean.reduce((s,h) => s+h.value, 0);
  const portfolio = total + contribution;
  const allocation = classes.map((category,i) => {
    const current = clean.filter(h=>h.category===category).reduce((s,h)=>s+h.value,0);
    const target = profiles[profile][i];
    return {category,current,weight:total ? current/total*100 : 0,target,delta:portfolio*target/100-current};
  });
  const aggregate = new Map();
  clean.forEach(h=>aggregate.set(h.name.toLocaleLowerCase('pt-BR'), (aggregate.get(h.name.toLocaleLowerCase('pt-BR')) || 0)+h.value));
  const concentration = total ? Math.max(0,...aggregate.values())/total*100 : 0;
  const drift = total ? allocation.reduce((s,a)=>s+Math.abs(a.weight-a.target),0)/2 : 0;
  return {total,portfolio,allocation,concentration,drift};
}
export function project(initial, monthly, years, annualRate) {
  if (![initial,monthly,years,annualRate].every(Number.isFinite) || initial<0 || monthly<0 || years<1 || years>50 || !Number.isInteger(years) || annualRate<=-100 || annualRate>100) throw Error('Parâmetros de projeção inválidos.');
  const rate = (1+annualRate/100)**(1/12)-1;
  let balance=initial;
  for (let i=0;i<years*12;i++) balance=balance*(1+rate)+monthly;
  return {balance, invested:initial+monthly*years*12};
}
// Formato delimitado explícito: cabeçalho nome;classe;valor, valores em reais.
export function parseCSV(text) {
  if (typeof text !== 'string' || text.length>1e6) throw Error('CSV excede o limite de 1 MB.');
  const rows=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if (rows.shift()?.trim().toLowerCase()!=='nome;classe;valor') throw Error('Use o cabeçalho nome;classe;valor.');
  if (!rows.length || rows.length>1000) throw Error('Importe entre 1 e 1.000 posições.');
  return rows.map((line,i)=> {
    const fields=line.split(';');
    if (fields.length!==3 || !/^\d+(?:[.,]\d{1,2})?$/.test(fields[2].trim())) throw Error(`Linha ${i+2}: use nome;classe;valor e valor sem separador de milhar.`);
    try { return validateHolding({name:fields[0],category:fields[1].trim(),value:Number(fields[2].trim().replace(',','.'))}); }
    catch(e) {throw Error(`Linha ${i+2}: ${e.message}`);}
  });
}
