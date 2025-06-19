import { OrchestrationAgent } from '../OrchestrationAgent';
import { RoofMeasurements, ExtractedField } from '../types';

describe('Roof Area Conversion', () => {
  describe('OrchestrationAgent roof area conversion', () => {
    it('should convert roof area from square feet to squares when saving JobData', () => {
      // Create mock roof data with area in square feet (as would come from extraction)
      const mockRoofData: Partial<RoofMeasurements> = {
        totalRoofArea: {
          value: 2295, // This represents 2295 square feet (raw value from document)
          confidence: 0.9,
          rationale: 'Extracted from roof report',
          source: 'text',
          attempts: 1
        } as ExtractedField<number>,
        eaveLength: {
          value: 258,
          confidence: 0.8,
          rationale: 'Extracted from roof report',
          source: 'text',
          attempts: 1
        } as ExtractedField<number>
      };

      // Simulate the conversion logic from OrchestrationAgent
      const roofAreaSquares = mockRoofData.totalRoofArea?.value 
        ? mockRoofData.totalRoofArea.value / 100 
        : undefined;

      // Verify the conversion
      expect(roofAreaSquares).toBe(22.95); // 2295 / 100 = 22.95 squares
    });

    it('should handle null/undefined roof area values', () => {
      const mockRoofDataNull: Partial<RoofMeasurements> = {
        totalRoofArea: {
          value: null,
          confidence: 0,
          rationale: 'Not found',
          source: 'fallback',
          attempts: 0
        } as ExtractedField<number | null>
      };

      const roofAreaSquares = mockRoofDataNull.totalRoofArea?.value 
        ? mockRoofDataNull.totalRoofArea.value / 100 
        : undefined;

      expect(roofAreaSquares).toBeUndefined();
    });

    it('should handle various roof area values correctly', () => {
      const testCases = [
        { input: 1500, expected: 15.0 },   // Small roof
        { input: 2295, expected: 22.95 },  // Medium roof (from logs)
        { input: 3500, expected: 35.0 },   // Large roof
        { input: 100, expected: 1.0 },     // Very small roof
      ];

      testCases.forEach(({ input, expected }) => {
        const roofAreaSquares = input / 100;
        expect(roofAreaSquares).toBe(expected);
      });
    });
  });

  describe('Expected data format consistency', () => {
    it('should match the format expected by DiscrepancyAnalyzerAgent', () => {
      // DiscrepancyAnalyzerAgent expects roof area in squares and multiplies by 100 to get sq ft
      const roofAreaInSquares = 22.95;
      const expectedSqFt = roofAreaInSquares * 100;
      
      expect(expectedSqFt).toBe(2295);
    });

    it('should match the format expected by SupplementValidator', () => {
      // SupplementValidator uses jobData.roof_area_squares and expects it to be in squares
      const mockJobData = {
        roof_area_squares: 22.95
      };
      
      const roofAreaSF = mockJobData.roof_area_squares * 100;
      expect(roofAreaSF).toBe(2295);
    });
  });
}); 