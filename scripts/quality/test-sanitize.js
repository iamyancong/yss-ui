const createDefaultExpression = () => ({
  type: 'GROUP',
  logicalOp: 'AND',
  children: [
    {
      id: 'default_id',
      type: 'LEAF',
      field: '',
      operator: '=',
      value: '',
      betweenValue1: '',
      betweenValue2: '',
    },
  ],
});

const sanitizeExpression = expr => {
  if (!expr || typeof expr !== 'object') {
    return createDefaultExpression();
  }
  try {
    const jsonStr = JSON.stringify(expr);
    const parsed = JSON.parse(jsonStr);
    return {
      type: parsed.type || 'GROUP',
      logicalOp: parsed.logicalOp || 'AND',
      children: Array.isArray(parsed.children) ? parsed.children : [],
    };
  } catch {
    return createDefaultExpression();
  }
};

const nestedData = {
  id: 'root',
  type: 'GROUP',
  logicalOp: 'AND',
  children: [
    {
      id: 'leaf1',
      type: 'LEAF',
      field: 'age',
      operator: '=',
      value: '18',
    },
    {
      id: 'group2',
      type: 'GROUP',
      logicalOp: 'AND',
      children: [
        {
          id: 'leaf3',
          type: 'LEAF',
          field: 'city',
          operator: '=',
          value: 'shanghai',
        },
      ],
      linkedFromLeafId: 'leaf1',
    },
  ],
};

const result = sanitizeExpression(nestedData);
console.log(JSON.stringify(result, null, 2));
