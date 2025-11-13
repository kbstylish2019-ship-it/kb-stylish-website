import { ImageResponse } from 'next/og'
 
// Route segment config
export const runtime = 'edge'
 
// Image metadata
export const size = {
  width: 32,
  height: 32,
}
export const contentType = 'image/png'
 
// Image generation - Use actual KB logo
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#1976D2',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
        }}
      >
        {/* KB Logo representation for favicon */}
        <div
          style={{
            width: '24px',
            height: '24px',
            background: 'white',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Yellow dot */}
          <div
            style={{
              position: 'absolute',
              top: '4px',
              left: '6px',
              width: '4px',
              height: '4px',
              background: '#FFD400',
              borderRadius: '50%',
            }}
          />
          {/* Red dot */}
          <div
            style={{
              position: 'absolute',
              top: '4px',
              right: '6px',
              width: '4px',
              height: '4px',
              background: '#E31B23',
              borderRadius: '50%',
            }}
          />
          {/* Scissors */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginTop: '2px' }}>
            <path d="M8 12L20 4M8 12L20 20" stroke="#1976D2" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
