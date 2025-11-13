import { NextResponse } from 'next/server';
import { fetchActiveBranches } from '@/lib/apiClient';

export async function GET() {
  try {
    const branches = await fetchActiveBranches();
    
    return NextResponse.json({
      success: true,
      branches
    });
  } catch (error) {
    console.error('Branches API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch branches' },
      { status: 500 }
    );
  }
}
