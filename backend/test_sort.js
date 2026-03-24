const { certificateListQuerySchema } = require('./src/utils/validation');
const result = certificateListQuerySchema.parse({});
console.log('Default sort:', result.sort);
