import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const isDevelopment = process.env.NODE_ENV === 'development';

// Map table names to Prisma models
const tableModelMap: Record<string, any> = {
  'ct_accounts': prisma.ctAccount,
  'ct_posts': prisma.ctPost,
  'agents': prisma.agent,
  'agent_accounts': prisma.agentAccount,
  'agent_deployments': prisma.agentDeployment,
  'market_indicators_6h': prisma.marketIndicators6h,
  'signals': prisma.signal,
  'positions': prisma.position,
  'billing_events': prisma.billingEvent,
  'pnl_snapshots': prisma.pnlSnapshot,
  'impact_factor_history': prisma.impactFactorHistory,
  'venue_status': prisma.venueStatus,
  'token_registry': prisma.tokenRegistry,
  'audit_logs': prisma.auditLog,
};

// Convert snake_case to camelCase (handles letters and numbers)
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
}

// Coerce string values to appropriate types
function coerceValue(value: string): any {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  // Number (integer or float)
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  
  // ISO Date
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
    return new Date(value);
  }
  
  // JSON object or array
  if ((value.startsWith('{') && value.endsWith('}')) || 
      (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      // If parsing fails, return as string
    }
  }
  
  // Default: return as string
  return value;
}

// Parse PostgREST-style query parameters
function parseQuery(query: Record<string, any>) {
  const where: any = {};
  const options: any = {};
  const fieldFilters: Record<string, any[]> = {}; // Track all filters per field

  for (const [key, value] of Object.entries(query)) {
    // Normalize value to array for consistent handling
    const values = Array.isArray(value) ? value : [value];
    
    if (key === 'select') {
      // Handle select - Prisma uses object notation
      continue; // We'll return all fields for simplicity
    } else if (key === 'order') {
      // Handle order: field.asc or field.desc.nullslast
      const orderParts = values[0].split('.');
      const field = snakeToCamel(orderParts[0]); // Convert snake_case to camelCase
      const direction = orderParts[1] === 'desc' ? 'desc' : 'asc';
      options.orderBy = { [field]: direction };
    } else if (key === 'limit') {
      options.take = parseInt(values[0]);
    } else if (key === 'offset') {
      options.skip = parseInt(values[0]);
    } else {
      // Collect all filters for this field
      const camelKey = snakeToCamel(key);
      if (!fieldFilters[camelKey]) {
        fieldFilters[camelKey] = [];
      }
      
      for (const val of values) {
        if (typeof val === 'string') {
          if (val.startsWith('eq.')) {
            fieldFilters[camelKey].push({ op: 'eq', value: coerceValue(val.substring(3)) });
          } else if (val.startsWith('neq.')) {
            fieldFilters[camelKey].push({ op: 'neq', value: coerceValue(val.substring(4)) });
          } else if (val.startsWith('in.(')) {
            const rawValues = val.substring(4, val.length - 1).split(',');
            fieldFilters[camelKey].push({ op: 'in', value: rawValues.map(coerceValue) });
          } else if (val.startsWith('gte.')) {
            fieldFilters[camelKey].push({ op: 'gte', value: coerceValue(val.substring(4)) });
          } else if (val.startsWith('lte.')) {
            fieldFilters[camelKey].push({ op: 'lte', value: coerceValue(val.substring(4)) });
          } else if (val.startsWith('gt.')) {
            fieldFilters[camelKey].push({ op: 'gt', value: coerceValue(val.substring(3)) });
          } else if (val.startsWith('lt.')) {
            fieldFilters[camelKey].push({ op: 'lt', value: coerceValue(val.substring(3)) });
          }
        }
      }
    }
  }

  // Build where clause from collected filters
  for (const [field, filters] of Object.entries(fieldFilters)) {
    if (filters.length === 0) continue;
    
    // Separate neq filters from others
    const neqFilters = filters.filter(f => f.op === 'neq');
    const otherFilters = filters.filter(f => f.op !== 'neq');
    
    // Build filter object using explicit Prisma keys
    let fieldFilter: any = {};
    
    // Handle eq filters (check for contradictions)
    const eqFilters = otherFilters.filter(f => f.op === 'eq');
    if (eqFilters.length > 0) {
      // Multiple eq with different values = contradiction, use impossible condition
      const uniqueEqValues = [...new Set(eqFilters.map(f => JSON.stringify(f.value)))];
      if (uniqueEqValues.length > 1) {
        // Contradictory equals - create impossible condition
        fieldFilter.AND = eqFilters.map(f => ({ equals: f.value }));
      } else {
        fieldFilter.equals = eqFilters[0].value;
      }
    }
    
    // Handle in filters (intersect if multiple)
    const inFilters = otherFilters.filter(f => f.op === 'in');
    if (inFilters.length > 0) {
      let intersection = inFilters[0].value;
      for (let i = 1; i < inFilters.length; i++) {
        intersection = intersection.filter((v: any) => 
          inFilters[i].value.some((v2: any) => JSON.stringify(v) === JSON.stringify(v2))
        );
      }
      fieldFilter.in = intersection;
    }
    
    // Handle range filters (narrow bounds)
    const gteFilters = otherFilters.filter(f => f.op === 'gte');
    if (gteFilters.length > 0) {
      fieldFilter.gte = Math.max(...gteFilters.map(f => Number(f.value)));
    }
    
    const lteFilters = otherFilters.filter(f => f.op === 'lte');
    if (lteFilters.length > 0) {
      fieldFilter.lte = Math.min(...lteFilters.map(f => Number(f.value)));
    }
    
    const gtFilters = otherFilters.filter(f => f.op === 'gt');
    if (gtFilters.length > 0) {
      fieldFilter.gt = Math.max(...gtFilters.map(f => Number(f.value)));
    }
    
    const ltFilters = otherFilters.filter(f => f.op === 'lt');
    if (ltFilters.length > 0) {
      fieldFilter.lt = Math.min(...ltFilters.map(f => Number(f.value)));
    }
    
    // Handle multiple neq filters
    if (neqFilters.length > 0) {
      const notValues = neqFilters.map(f => f.value);
      if (notValues.length === 1) {
        fieldFilter.not = notValues[0];
      } else {
        // Multiple NOT conditions - use notIn
        fieldFilter.notIn = notValues;
      }
    }
    
    // If only one key and it's 'equals', use shorthand
    if (Object.keys(fieldFilter).length === 1 && fieldFilter.equals !== undefined) {
      where[field] = fieldFilter.equals;
    } else {
      where[field] = fieldFilter;
    }
  }

  return { where, options };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startTime = Date.now();
  const { path, ...query } = req.query;
  
  const pathSegments = Array.isArray(path) ? path.join('/') : path || '';
  const tableName = pathSegments;

  if (isDevelopment) {
    console.log(`[DB API] ${req.method} ${tableName}`, {
      query: Object.keys(query).length > 0 ? query : undefined,
      hasBody: !!req.body,
    });
  }

  try {
    const model = tableModelMap[tableName];
    
    if (!model) {
      return res.status(404).json({ 
        error: `Table '${tableName}' not found`,
        available: Object.keys(tableModelMap),
      });
    }

    const { where, options } = parseQuery(query);

    let result;

    switch (req.method) {
      case 'GET':
        result = await model.findMany({
          where,
          ...options,
        });
        break;

      case 'POST':
        // Handle both single objects and arrays
        if (Array.isArray(req.body)) {
          // Create records one by one to return them with IDs
          result = [];
          for (const item of req.body) {
            const created = await model.create({
              data: item,
            });
            result.push(created);
          }
        } else {
          result = await model.create({
            data: req.body,
          });
        }
        break;

      case 'PATCH':
        // For PATCH, update all matching records
        result = await model.updateMany({
          where,
          data: req.body,
        });
        break;

      case 'DELETE':
        result = await model.deleteMany({
          where,
        });
        break;

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (isDevelopment) {
      const duration = Date.now() - startTime;
      console.log(`[DB API] Success in ${duration}ms`);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    console.error('[DB API] Error:', {
      error: error.message,
      path: tableName,
      duration,
    });
    
    return res.status(500).json({
      error: error.message || 'Database request failed',
      details: isDevelopment ? error : undefined,
    });
  }
}
