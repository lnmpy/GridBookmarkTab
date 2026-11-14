import { evaluateCalculatorDocument } from './calculator-evaluator';

describe('evaluateCalculatorDocument', () => {
  it('should evaluate arithmetic, variables, percentages, and sum', () => {
    const doc = [
      '# Budget',
      'income = 10000',
      'rent = 3000',
      'tax = 10% of income',
      '100 + 20%',
      'sum',
    ].join('\n');

    const result = evaluateCalculatorDocument(doc);
    expect(result.lines[0].isComment).toBe(true);
    expect(result.lines[1].value).toBe(10000);
    expect(result.lines[2].value).toBe(3000);
    expect(result.lines[3].value).toBe(1000);
    expect(result.lines[4].value).toBe(120);
    expect(result.lines[5].value).toBe(14120);
  });

  it('should support math functions and currency prefixes', () => {
    const doc = ['$1,200 + $300', 'sqrt(144)', 'round(3.14159, 2)'].join('\n');
    const result = evaluateCalculatorDocument(doc);
    expect(result.lines[0].value).toBe(1500);
    expect(result.lines[1].value).toBe(12);
    expect(result.lines[2].value).toBe(3.14);
  });

  it('should support 10 decimal places and exact large number multiplication', () => {
    const doc = [
      '0.1 + 0.2',
      '0.1234567890 + 0.0000000001',
      '1 / 3',
      '99999999999999999999 * 99999999999999999999',
      '12345678901234567890.12345 * 2',
    ].join('\n');
    const result = evaluateCalculatorDocument(doc);
    expect(result.lines[0].formatted).toBe('0.3');
    expect(result.lines[1].formatted).toBe('0.1234567891');
    expect(result.lines[2].formatted).toBe('0.3333333333');
    expect(result.lines[3].formatted).toBe(
      '9,999,999,999,999,999,999,800,000,000,000,000,000,001',
    );
    expect(result.lines[4].formatted).toBe(
      '24,691,357,802,469,135,780.2469',
    );
  });
});
