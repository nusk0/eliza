import { IImageDescriptionService } from '../generation';
import { describe, it, expect } from 'vitest';

class MockImageDescriptionService implements IImageDescriptionService {
  async describeImage(imageUrl: string): Promise<string> {
    return 'Mock description of the image';
  }
}

describe('ImageDescriptionService', () => {
  const service = new MockImageDescriptionService();
  const testImageUrl = 'https://upload.wikimedia.org/wikipedia/commons/b/bd/Test.svg';

  it('should describe an image from URL', async () => {
    const description = await service.describeImage(testImageUrl);
    expect(description).toBe('Mock description of the image');
  });
});