import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Introduction() {
  const navigate = useNavigate()
  const doveRef = useRef(null)
  const wingTopRef = useRef(null)
  const wingBottomRef = useRef(null)
  const animRef = useRef(null)
  const audioRef = useRef(null)
  const [muted, setMuted] = useState(true)

  const W = typeof window !== 'undefined' ? window.innerWidth : 1440
  const H = typeof window !== 'undefined' ? window.innerHeight : 900

  // ── Time, weather, and season detection ──────────────
  const getSkyColors = () => {
    const hour = new Date().getHours()
    const month = new Date().getMonth() // 0=Jan, 11=Dec

    // Season: 0=winter, 1=spring, 2=summer, 3=fall
    const season =
      month <= 1 || month === 11 ? 0 // winter: Dec-Feb
      : month <= 4 ? 1 // spring: Mar-May
      : month <= 7 ? 2 // summer: Jun-Aug
      : 3 // fall: Sep-Nov

    // Time of day
    const isDawn = hour >= 5 && hour < 7
    const isMorning = hour >= 7 && hour < 11
    const isNoon = hour >= 11 && hour < 14
    const isAfternoon = hour >= 14 && hour < 17
    const isDusk = hour >= 17 && hour < 20
    const isNight = hour >= 20 || hour < 5

    // Sky top color, sky bottom color, ambient light
    let skyTop
    let skyBottom
    let ambientOpacity
    let fogColor
    let foliageTop
    let foliageBright
    let lakeColor
    let reflectionColor
    let sunMoonVisible

    if (isNight) {
      skyTop = '#010810'
      skyBottom = '#050f08'
      ambientOpacity = 0.0
      fogColor = '#0a1a10'
      foliageTop = '#082010'
      foliageBright = '#0f3018'
      lakeColor = '#071520'
      reflectionColor = '#1a3a5c'
      sunMoonVisible = 'moon'
    } else if (isDawn) {
      skyTop = '#1a0a2e'
      skyBottom = '#8b3a1a'
      ambientOpacity = 0.15
      fogColor = '#c4783a'
      foliageTop = '#1a3010'
      foliageBright = '#2a5020'
      lakeColor = '#1a3a5c'
      reflectionColor = '#c4783a'
      sunMoonVisible = 'sun-low'
    } else if (isMorning) {
      skyTop = '#1a3a6e'
      skyBottom = '#4a8a4a'
      ambientOpacity = 0.25
      fogColor = '#a8d4b0'
      foliageTop = '#1a5228'
      foliageBright = '#3da852'
      lakeColor = '#1e6b8a'
      reflectionColor = '#7dd3fc'
      sunMoonVisible = 'sun-mid'
    } else if (isNoon) {
      skyTop = '#0d2e1a'
      skyBottom = '#1a5228'
      ambientOpacity = 0.35
      fogColor = '#c8e6d0'
      foliageTop = '#1a5228'
      foliageBright = '#4ade80'
      lakeColor = '#1e6b8a'
      reflectionColor = '#93c5fd'
      sunMoonVisible = 'sun-high'
    } else if (isAfternoon) {
      skyTop = '#1a2e0d'
      skyBottom = '#2a5020'
      ambientOpacity = 0.28
      fogColor = '#d4e8c0'
      foliageTop = '#1a5228'
      foliageBright = '#3da852'
      lakeColor = '#1e5c78'
      reflectionColor = '#7dd3fc'
      sunMoonVisible = 'sun-mid'
    } else if (isDusk) {
      skyTop = '#1a0a0a'
      skyBottom = '#7a3010'
      ambientOpacity = 0.2
      fogColor = '#e88040'
      foliageTop = '#0f2a10'
      foliageBright = '#1a4020'
      lakeColor = '#1a2a3c'
      reflectionColor = '#e88040'
      sunMoonVisible = 'sun-low'
    } else {
      skyTop = '#010810'
      skyBottom = '#050f08'
      ambientOpacity = 0.0
      fogColor = '#0a1a10'
      foliageTop = '#082010'
      foliageBright = '#0f3018'
      lakeColor = '#071520'
      reflectionColor = '#1a3a5c'
      sunMoonVisible = 'moon'
    }

    // Season foliage color override
    const seasonFoliage = {
      0: { primary: '#1a3020', secondary: '#243828', accent: '#2a4030' }, // winter — dark muted
      1: { primary: '#22c55e', secondary: '#16a34a', accent: '#86efac' }, // spring — bright green
      2: { primary: '#15803d', secondary: '#166534', accent: '#4ade80' }, // summer — deep green
      3: { primary: '#854d0e', secondary: '#92400e', accent: '#fb923c' }, // fall — orange/brown
    }

    return {
      skyTop,
      skyBottom,
      ambientOpacity,
      fogColor,
      foliageTop,
      foliageBright,
      lakeColor,
      reflectionColor,
      sunMoonVisible,
      season,
      seasonColors: seasonFoliage[season],
      hour,
      isDawn,
      isMorning,
      isNoon,
      isAfternoon,
      isDusk,
      isNight,
    }
  }

  const skyColors = getSkyColors()

  // ── Weather via IP geolocation + Open-Meteo (no browser prompt) ──
  const [weather, setWeather] = useState({
    condition: 'clear', // clear | rain | snow | cloudy
    intensity: 0, // 0-1
  })

  useEffect(() => {
    // Use IP-based geolocation — no browser permission prompt
    // Open-Meteo requires lat/lon so we get it silently from
    // a free IP geolocation API first
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(async (geo) => {
        const lat = geo.latitude
        const lon = geo.longitude
        if (!lat || !lon) return

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weathercode,precipitation&timezone=auto`
        const res = await fetch(url)
        const data = await res.json()
        const code = data?.current?.weathercode ?? 0
        const precip = data?.current?.precipitation ?? 0

        let condition = 'clear'
        let intensity = 0
        if (code >= 71 && code <= 77) {
          condition = 'snow'
          intensity = Math.min(precip / 5, 1)
        } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
          condition = 'rain'
          intensity = Math.min(precip / 10, 1)
        } else if (code >= 1 && code <= 3) {
          condition = 'cloudy'
          intensity = code / 3
        }
        setWeather({ condition, intensity })
      })
      .catch(() => {})
    // silently fail — weather is decorative, not critical
  }, [])

  // ── Rain particle generation ──
  const rainParticles = useMemo(() => {
    if (weather.condition !== 'rain') return []
    const count = Math.floor(80 + weather.intensity * 120)
    return [...Array(count)].map((_, i) => ({
      x: (i * 137.5) % W,
      y: (i * 89.3) % H,
      length: 12 + (i % 8) * 3,
      speed: 0.8 + (i % 5) * 0.3,
      opacity: 0.3 + (i % 4) * 0.1,
      delay: i * 0.05,
    }))
  }, [weather, W, H])

  // ── Snow particle generation ──
  const snowParticles = useMemo(() => {
    if (weather.condition !== 'snow') return []
    const count = Math.floor(50 + weather.intensity * 80)
    return [...Array(count)].map((_, i) => ({
      x: (i * 97.3) % W,
      y: (i * 61.7) % H,
      r: 2 + (i % 4),
      opacity: 0.4 + (i % 3) * 0.15,
      drift: (i % 2 === 0 ? 1 : -1) * (8 + (i % 12)),
    }))
  }, [weather, W, H])

  useEffect(() => {
    const dove = doveRef.current
    if (!dove) return

    const W = window.innerWidth
    const H = window.innerHeight

    const BRANCH_X = W * 0.18
    const BRANCH_Y = H * 0.28
    const WATER_X = W * 0.60
    const WATER_Y = H * 0.775

    let state = 'perched'
    let t = 0
    let perchTimer = null
    let drinkTimer = null
    let wingAngle = 0
    let drinkPhase = 0
    let drinkDir = 1

    const cubicBezier = (t, p0, p1, p2, p3) =>
      Math.pow(1-t,3)*p0 + 3*Math.pow(1-t,2)*t*p1 +
      3*(1-t)*Math.pow(t,2)*p2 + Math.pow(t,3)*p3

    const setWings = (offset) => {
      if (wingTopRef.current)
        wingTopRef.current.setAttribute('d',
          `M 0,0 C -15,${-22+offset} -40,${-38+offset} -48,${-22+offset} C -36,${-8+offset} -18,${-2+offset} 0,0`)
      if (wingBottomRef.current)
        wingBottomRef.current.setAttribute('d',
          `M 0,0 C 12,${-10-offset*0.4} 28,${-20-offset*0.4} 30,${-10-offset*0.4} C 22,${0-offset*0.4} 10,4 0,0`)
    }

    const startFlyToWater = () => { state = 'toWater'; t = 0 }
    const startDrinking = () => {
      state = 'drinking'; drinkPhase = 0; drinkDir = 1
      drinkTimer = setTimeout(() => { state = 'toTree'; t = 0 }, 3000)
    }
    const startPerch = () => {
      state = 'perched'
      perchTimer = setTimeout(startFlyToWater, 2200)
    }

    dove.setAttribute('transform', `translate(${BRANCH_X},${BRANCH_Y}) scale(-1,1)`)
    perchTimer = setTimeout(startFlyToWater, 1800)

    const animate = () => {
      wingAngle += 0.18

      if (state === 'perched') {
        setWings(Math.sin(wingAngle * 0.25) * 5)
        // Perched facing left — beak toward center of scene
        dove.setAttribute('transform', `translate(${BRANCH_X},${BRANCH_Y}) scale(-1,1)`)

      } else if (state === 'toWater') {
        t += 0.005
        if (t >= 1) { t = 1; startDrinking() }
        const cp1x = BRANCH_X + (WATER_X-BRANCH_X)*0.3
        const cp1y = BRANCH_Y - H*0.22
        const cp2x = BRANCH_X + (WATER_X-BRANCH_X)*0.72
        const cp2y = WATER_Y - H*0.28
        const x = cubicBezier(t, BRANCH_X, cp1x, cp2x, WATER_X)
        const y = cubicBezier(t, BRANCH_Y, cp1y, cp2y, WATER_Y)
        const nx = cubicBezier(Math.min(t+0.01,1), BRANCH_X, cp1x, cp2x, WATER_X)
        const ny = cubicBezier(Math.min(t+0.01,1), BRANCH_Y, cp1y, cp2y, WATER_Y)
        const angle = Math.atan2(ny-y, nx-x)*180/Math.PI
        const fi = 0.4 + Math.sin(t*Math.PI)*0.6
        setWings(Math.sin(wingAngle)*22*fi)
        // Facing right toward water — no flip needed
        dove.setAttribute('transform', `translate(${x},${y}) rotate(${angle})`)

      } else if (state === 'drinking') {
        drinkPhase += 0.035 * drinkDir
        if (drinkPhase > 1) drinkDir = -1
        if (drinkPhase < 0) drinkDir = 1

        // Bird stays on lily pad, tilts beak down to water
        // Rotation swings from 0 (upright) to ~40deg (beak touching water)
        const tiltAngle = Math.sin(drinkPhase * Math.PI) * 42

        // Subtle body bob — very small vertical movement
        const bodyBob = Math.sin(drinkPhase * Math.PI) * 4

        setWings(Math.sin(wingAngle * 0.15) * 4)

        // At water facing left — beak dips down toward water
        dove.setAttribute('transform',
          `translate(${WATER_X}, ${WATER_Y - bodyBob}) rotate(${-tiltAngle}) scale(-1,1)`)

      } else if (state === 'toTree') {
        t += 0.0045
        if (t >= 1) { t = 1; startPerch() }
        const cp1x = WATER_X - (WATER_X-BRANCH_X)*0.28
        const cp1y = WATER_Y - H*0.24
        const cp2x = WATER_X - (WATER_X-BRANCH_X)*0.68
        const cp2y = BRANCH_Y - H*0.18
        const x = cubicBezier(t, WATER_X, cp1x, cp2x, BRANCH_X)
        const y = cubicBezier(t, WATER_Y, cp1y, cp2y, BRANCH_Y)
        const nx = cubicBezier(Math.min(t+0.01,1), WATER_X, cp1x, cp2x, BRANCH_X)
        const ny = cubicBezier(Math.min(t+0.01,1), WATER_Y, cp1y, cp2y, BRANCH_Y)
        const angle = Math.atan2(ny-y, nx-x)*180/Math.PI
        const fi = 0.4 + Math.sin(t*Math.PI)*0.6
        setWings(Math.sin(wingAngle)*22*fi)
        // Flying left — flip horizontally so beak faces left
        // We rotate by the tangent angle then flip X axis
        // The angle points left (negative x direction) so we
        // subtract 180 to get the correct body orientation
        // then scale(-1,1) flips the beak to face the direction
        // of travel
        dove.setAttribute('transform',
          `translate(${x},${y}) rotate(${angle - 180}) scale(-1,1)`)
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(animRef.current)
      clearTimeout(perchTimer)
      clearTimeout(drinkTimer)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = 0.18
    audio.loop = true

    const tryPlay = () => {
      audio.play().catch(() => {
        const unlock = () => {
          audio.play().catch(() => {})
          document.removeEventListener('click', unlock)
          document.removeEventListener('touchstart', unlock)
        }
        document.addEventListener('click', unlock, { once: true })
        document.addEventListener('touchstart', unlock, { once: true })
      })
    }

    tryPlay()

    return () => {
      audio.pause()
      audio.currentTime = 0
    }
  }, [])

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100vh',
      overflow: 'hidden', background: '#0d1f0f',
    }}>
      <audio
        ref={audioRef}
        loop
        preload="auto"
        autoPlay
        playsInline
        muted={muted}
      >
        <source src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" type="audio/mpeg" />
        <source src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" type="audio/mpeg" />
      </audio>
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Sky gradient */}
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyColors.skyTop}/>
            <stop offset="45%" stopColor={skyColors.skyBottom}/>
            <stop offset="75%" stopColor={skyColors.seasonColors.primary} stopOpacity="0.8"/>
            <stop offset="100%" stopColor="#0a1f0c"/>
          </linearGradient>
          {/* Sunlight beam through canopy */}
          <radialGradient id="sunbeam" cx="55%" cy="20%" r="60%">
            <stop offset="0%" stopColor="#d4f5a0" stopOpacity="0.12"/>
            <stop offset="50%" stopColor="#86efac" stopOpacity="0.05"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          {/* Lake gradient */}
          <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e6b8a" stopOpacity="0.95"/>
            <stop offset="40%" stopColor="#134e6f"/>
            <stop offset="100%" stopColor="#0a2d42" stopOpacity="0.9"/>
          </linearGradient>
          {/* Lake shimmer */}
          <linearGradient id="lakeShimmer" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0"/>
            <stop offset="40%" stopColor="#7dd3fc" stopOpacity="0.3"/>
            <stop offset="60%" stopColor="white" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="white" stopOpacity="0"/>
          </linearGradient>
          {/* Forest floor gradient */}
          <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a4a20"/>
            <stop offset="100%" stopColor="#0a1f0c"/>
          </linearGradient>
          {/* Deep foliage radial */}
          <radialGradient id="foliageDark" cx="50%" cy="35%">
            <stop offset="0%" stopColor="#2d8a3e"/>
            <stop offset="50%" stopColor="#1a5c28"/>
            <stop offset="100%" stopColor="#0d2e12"/>
          </radialGradient>
          <radialGradient id="foliageMid" cx="45%" cy="30%">
            <stop offset="0%" stopColor="#3dab52"/>
            <stop offset="55%" stopColor="#1e7a32"/>
            <stop offset="100%" stopColor="#0f3d18"/>
          </radialGradient>
          <radialGradient id="foliageLight" cx="40%" cy="25%">
            <stop offset="0%" stopColor="#6abf72"/>
            <stop offset="60%" stopColor="#2e9442"/>
            <stop offset="100%" stopColor="#164d22"/>
          </radialGradient>
          {/* Mist gradient */}
          <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c8e6d0" stopOpacity="0"/>
            <stop offset="50%" stopColor="#c8e6d0" stopOpacity="0.08"/>
            <stop offset="100%" stopColor="#c8e6d0" stopOpacity="0"/>
          </linearGradient>
          {/* Water reflection */}
          <linearGradient id="reflection" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.15"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </linearGradient>
          <filter id="blur2">
            <feGaussianBlur stdDeviation="2"/>
          </filter>
          <filter id="blur4">
            <feGaussianBlur stdDeviation="4"/>
          </filter>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── SKY / ATMOSPHERE ── */}
        <rect x="0" y="0" width={W} height={H} fill="url(#sky)"/>

        {/* Sun or Moon */}
        {skyColors.sunMoonVisible === 'sun-high' && (
          <g>
            <circle cx={W * 0.72} cy={H * 0.12} r={W * 0.03} fill="#fde68a" opacity={0.9} filter="url(#blur2)"/>
            <circle cx={W * 0.72} cy={H * 0.12} r={W * 0.022} fill="#fef3c7" opacity={1}/>
            {[...Array(8)].map((_, i) => {
              const angle = (i / 8) * Math.PI * 2
              return (
                <line
                  key={i}
                  x1={W * 0.72 + Math.cos(angle) * W * 0.026}
                  y1={H * 0.12 + Math.sin(angle) * W * 0.026}
                  x2={W * 0.72 + Math.cos(angle) * W * 0.042}
                  y2={H * 0.12 + Math.sin(angle) * W * 0.042}
                  stroke="#fde68a"
                  strokeWidth={2}
                  opacity={0.6}
                  strokeLinecap="round"
                />
              )
            })}
          </g>
        )}

        {skyColors.sunMoonVisible === 'sun-mid' && (
          <circle cx={W * 0.75} cy={H * 0.18} r={W * 0.025} fill="#fed7aa" opacity={0.8} filter="url(#blur2)"/>
        )}

        {skyColors.sunMoonVisible === 'sun-low' && (
          <g>
            <ellipse cx={W * 0.5} cy={H * 0.45} rx={W * 0.3} ry={H * 0.08} fill={skyColors.fogColor} opacity={0.25} filter="url(#blur4)"/>
            <circle cx={W * 0.78} cy={H * 0.42} r={W * 0.028} fill="#fb923c" opacity={0.85} filter="url(#blur2)"/>
          </g>
        )}

        {skyColors.sunMoonVisible === 'moon' && (
          <g>
            <circle cx={W * 0.8} cy={H * 0.12} r={W * 0.022} fill="#e2e8f0" opacity={0.9} filter="url(#blur2)"/>
            <circle cx={W * 0.8} cy={H * 0.12} r={W * 0.018} fill="#f1f5f9" opacity={1}/>
            <circle cx={W * 0.803} cy={H * 0.11} r={W * 0.005} fill="#cbd5e1" opacity={0.4}/>
            {[...Array(35)].map((_, i) => (
              <circle
                key={i}
                cx={20 + (i * 137.5) % (W * 0.9)}
                cy={8 + (i * 89.3) % (H * 0.35)}
                r={0.8 + (i % 3) * 0.5}
                fill="white"
                opacity={0.2 + (i % 5) * 0.08}
              />
            ))}
          </g>
        )}

        <rect x="0" y="0" width={W} height={H} fill="url(#sunbeam)"/>

        {/* Stars / light particles in upper sky (daytime) */}
        {!skyColors.isNight &&
          [...Array(40)].map((_, i) => (
            <circle
              key={i}
              cx={20 + (i * 137.5) % (W * 0.9)}
              cy={10 + (i * 89.3) % (H * 0.3)}
              r={0.8 + (i % 3) * 0.4}
              fill="white"
              opacity={0.15 + (i % 5) * 0.06}
            />
          ))}

        {/* ── BACKGROUND FOREST (distant, blurred, dark) ── */}
        {/* Far background tree silhouettes */}
        {[...Array(18)].map((_, i) => {
          const x = (i / 17) * W * 1.1 - W * 0.05
          const h = H * 0.35 + (i % 5) * H * 0.06
          const w = W * 0.04 + (i % 3) * W * 0.02
          return (
            <ellipse key={i}
              cx={x} cy={H * 0.38 - h * 0.3}
              rx={w} ry={h * 0.4}
              fill="#0d2e12"
              opacity={0.7 + (i % 3) * 0.1}
              filter="url(#blur4)"
            />
          )
        })}

        {/* Mid-distance tree silhouettes */}
        {[...Array(12)].map((_, i) => {
          const x = (i / 11) * W * 1.05 - W * 0.025
          const h = H * 0.5 + (i % 4) * H * 0.08
          const w = W * 0.055 + (i % 3) * W * 0.025
          return (
            <ellipse key={i}
              cx={x} cy={H * 0.42 - h * 0.3}
              rx={w} ry={h * 0.38}
              fill="#102a14"
              opacity={0.85}
              filter="url(#blur2)"
            />
          )
        })}

        {/* ── FOREST FLOOR ── */}
        <ellipse cx={W*0.5} cy={H*0.88} rx={W*0.8} ry={H*0.22}
          fill="url(#floor)" opacity={0.9}/>
        <rect x="0" y={H*0.82} width={W} height={H*0.18}
          fill="#0a1f0c"/>

        {/* Ground mist */}
        <rect x="0" y={H*0.65} width={W} height={H*0.2}
          fill="url(#mist)"/>

        {/* Ground ferns and grass (left) */}
        {[0.02, 0.06, 0.1, 0.14, 0.18, 0.22].map((xPct, i) => (
          <g key={i} transform={`translate(${W*xPct}, ${H*0.82})`}>
            {[-30,-18,-8,0,8,18,28].map((angle, j) => (
              <path key={j}
                d={`M 0,0 C ${angle*0.3},${-H*0.05} ${angle*0.6},${-H*0.1} ${angle},${-H*0.14}`}
                fill="none"
                stroke={j%2===0 ? "#1a5228" : "#22703a"}
                strokeWidth={1.5 + (j%3)*0.5}
                strokeLinecap="round"
                opacity={0.7+i*0.05}
              />
            ))}
          </g>
        ))}

        {/* Ground ferns and grass (right) */}
        {[0.78, 0.82, 0.86, 0.90, 0.94, 0.98].map((xPct, i) => (
          <g key={i} transform={`translate(${W*xPct}, ${H*0.82})`}>
            {[-25,-15,-6,0,6,15,25].map((angle, j) => (
              <path key={j}
                d={`M 0,0 C ${angle*0.3},${-H*0.04} ${angle*0.6},${-H*0.09} ${angle},${-H*0.12}`}
                fill="none"
                stroke={j%2===0 ? "#154a20" : "#1e6b30"}
                strokeWidth={1.5+(j%3)*0.5}
                strokeLinecap="round"
                opacity={0.65+i*0.04}
              />
            ))}
          </g>
        ))}

        {/* ── LARGE LEFT TREE ── */}
        <g>
          {/* Root spread */}
          {[
            `M ${W*0.06},${H*0.92} C ${W*0.03},${H*0.88} ${W*0.01},${H*0.86} ${-W*0.01},${H*0.85}`,
            `M ${W*0.09},${H*0.92} C ${W*0.07},${H*0.89} ${W*0.04},${H*0.88} ${W*0.02},${H*0.87}`,
            `M ${W*0.12},${H*0.92} C ${W*0.14},${H*0.89} ${W*0.16},${H*0.88} ${W*0.18},${H*0.87}`,
            `M ${W*0.11},${H*0.93} C ${W*0.12},${H*0.90} ${W*0.15},${H*0.89} ${W*0.17},${H*0.90}`,
          ].map((d, i) => (
            <path key={i} d={d} fill="none"
              stroke="#2d1a0e" strokeWidth={10-i*1.5} strokeLinecap="round"/>
          ))}

          {/* Main trunk — massive */}
          <path
            d={`M ${W*0.06},${H*0.92} C ${W*0.07},${H*0.78} ${W*0.08},${H*0.62} ${W*0.09},${H*0.48} C ${W*0.10},${H*0.36} ${W*0.11},${H*0.28} ${W*0.12},${H*0.18}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.038} strokeLinecap="round"
          />
          {/* Trunk shadow side */}
          <path
            d={`M ${W*0.075},${H*0.92} C ${W*0.085},${H*0.78} ${W*0.09},${H*0.62} ${W*0.10},${H*0.48} C ${W*0.105},${H*0.36} ${W*0.112},${H*0.28} ${W*0.115},${H*0.18}`}
            fill="none" stroke="#2a1508" strokeWidth={W*0.015} strokeLinecap="round" opacity={0.6}
          />
          {/* Trunk highlight */}
          <path
            d={`M ${W*0.07},${H*0.92} C ${W*0.075},${H*0.78} ${W*0.082},${H*0.62} ${W*0.088},${H*0.48}`}
            fill="none" stroke="#6b3c1a" strokeWidth={W*0.006} strokeLinecap="round" opacity={0.4}
          />

          {/* Main branch — dove lands here — extends right */}
          <path
            d={`M ${W*0.12},${H*0.26} C ${W*0.14},${H*0.255} ${W*0.16},${H*0.252} ${W*0.18},${H*0.258} C ${W*0.20},${H*0.264} ${W*0.22},${H*0.274} ${W*0.24},${H*0.28}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.018} strokeLinecap="round"
          />
          <path
            d={`M ${W*0.18},${H*0.258} C ${W*0.20},${H*0.252} ${W*0.225},${H*0.248} ${W*0.25},${H*0.252}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.012} strokeLinecap="round"
          />

          {/* Upper left branch */}
          <path
            d={`M ${W*0.115},${H*0.20} C ${W*0.09},${H*0.185} ${W*0.06},${H*0.175} ${W*0.03},${H*0.168}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.016} strokeLinecap="round"
          />
          {/* Upper right branch */}
          <path
            d={`M ${W*0.125},${H*0.16} C ${W*0.15},${H*0.145} ${W*0.175},${H*0.138} ${W*0.20},${H*0.142}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.013} strokeLinecap="round"
          />
          {/* Secondary branches */}
          <path
            d={`M ${W*0.10},${H*0.36} C ${W*0.07},${H*0.34} ${W*0.04},${H*0.33} ${W*0.01},${H*0.32}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.012} strokeLinecap="round"
          />
          <path
            d={`M ${W*0.11},${H*0.42} C ${W*0.14},${H*0.40} ${W*0.17},${H*0.39} ${W*0.20},${H*0.39}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.010} strokeLinecap="round"
          />
          {/* Small twigs */}
          {[
            [`M ${W*0.20},${H*0.142} C ${W*0.215},${H*0.125} ${W*0.228},${H*0.115} ${W*0.235},${H*0.108}`, 6],
            [`M ${W*0.215},${H*0.145} C ${W*0.225},${H*0.130} ${W*0.232},${H*0.122} ${W*0.238},${H*0.118}`, 5],
            [`M ${W*0.03},${H*0.168} C ${W*0.01},${H*0.155} ${-W*0.01},${H*0.148} ${-W*0.015},${H*0.142}`, 5],
            [`M ${W*0.04},${H*0.172} C ${W*0.025},${H*0.158} ${W*0.010},${H*0.150} ${W*0.005},${H*0.145}`, 4],
            [`M ${W*0.01},${H*0.32} C ${-W*0.01},${H*0.305} ${-W*0.02},${H*0.295} ${-W*0.025},${H*0.288}`, 5],
          ].map(([d, w], i) => (
            <path key={i} d={d} fill="none"
              stroke="#4a2a12" strokeWidth={w} strokeLinecap="round"/>
          ))}

          {/* ── FOLIAGE CANOPY — massive, layered ── */}
          {/* Deep background layer */}
          {[
            [W*0.10, H*0.08, W*0.22, H*0.18],
            [W*0.18, H*0.06, W*0.18, H*0.16],
            [W*0.04, H*0.10, W*0.16, H*0.14],
            [W*0.25, H*0.10, W*0.14, H*0.13],
            [W*0.02, H*0.14, W*0.14, H*0.12],
            [W*0.28, H*0.14, W*0.12, H*0.11],
          ].map(([cx, cy, rx, ry], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
              fill="#0d2e12" opacity={0.9}/>
          ))}
          {/* Mid layer — dark green */}
          {[
            [W*0.12, H*0.07, W*0.20, H*0.17, '#122e16'],
            [W*0.20, H*0.05, W*0.17, H*0.15, '#0f2812'],
            [W*0.06, H*0.09, W*0.15, H*0.13, '#142e18'],
            [W*0.26, H*0.09, W*0.13, H*0.12, '#102a14'],
            [W*0.03, H*0.17, W*0.12, H*0.11, '#122e16'],
            [W*0.30, H*0.13, W*0.11, H*0.10, '#0f2812'],
            [W*0.16, H*0.22, W*0.14, H*0.10, '#142e18'],
            [W*0.08, H*0.20, W*0.12, H*0.09, '#102a14'],
            [-W*0.02, H*0.12, W*0.10, H*0.09, '#0f2812'],
            [W*0.22, H*0.26, W*0.10, H*0.08, '#122e16'],
          ].map(([cx, cy, rx, ry, fill], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
              fill={fill} opacity={0.92}/>
          ))}
          {/* Main foliage layer */}
          {[
            [W*0.11, H*0.065, W*0.185, H*0.155, 'url(#foliageDark)'],
            [W*0.19, H*0.045, W*0.165, H*0.145, '#1a5228'],
            [W*0.07, H*0.085, W*0.145, H*0.125, 'url(#foliageMid)'],
            [W*0.25, H*0.085, W*0.125, H*0.115, '#185c24'],
            [W*0.04, H*0.155, W*0.115, H*0.105, '#1a5228'],
            [W*0.28, H*0.125, W*0.105, H*0.095, 'url(#foliageDark)'],
            [W*0.15, H*0.205, W*0.125, H*0.095, '#1e6b30'],
            [W*0.08, H*0.185, W*0.110, H*0.088, '#185c24'],
            [-W*0.01, H*0.105, W*0.095, H*0.082, '#1a5228'],
            [W*0.21, H*0.245, W*0.095, H*0.075, 'url(#foliageMid)'],
            [W*0.32, H*0.175, W*0.090, H*0.080, '#185c24'],
          ].map(([cx, cy, rx, ry, fill], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
              fill={fill} opacity={0.88}/>
          ))}
          {/* Bright highlight layer — light catching leaves */}
          {[
            [W*0.13, H*0.055, W*0.14, H*0.11, 'url(#foliageLight)'],
            [W*0.21, H*0.038, W*0.12, H*0.10, '#3da852'],
            [W*0.08, H*0.075, W*0.10, H*0.09, 'url(#foliageLight)'],
            [W*0.26, H*0.075, W*0.09, H*0.085, '#2e9442'],
            [W*0.05, H*0.14, W*0.08, H*0.075, '#3da852'],
            [W*0.17, H*0.19, W*0.09, H*0.075, 'url(#foliageLight)'],
            [W*0.29, H*0.115, W*0.075, H*0.068, '#2e9442'],
          ].map(([cx, cy, rx, ry, fill], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
              fill={fill} opacity={0.65}/>
          ))}
          {/* Sunlit leaf tips */}
          {[
            [W*0.15, H*0.042, W*0.08, H*0.06],
            [W*0.22, H*0.028, W*0.07, H*0.055],
            [W*0.09, H*0.062, W*0.06, H*0.05],
            [W*0.28, H*0.062, W*0.055, H*0.048],
          ].map(([cx, cy, rx, ry], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
              fill="#86efac" opacity={0.25}/>
          ))}
        </g>

        {/* ── RIGHT SIDE TREES (partial, framing) ── */}
        <g>
          {/* Right trunk 1 */}
          <path
            d={`M ${W*0.92},${H} C ${W*0.915},${H*0.82} ${W*0.91},${H*0.65} ${W*0.905},${H*0.48} C ${W*0.90},${H*0.34} ${W*0.895},${H*0.22} ${W*0.892},${H*0.10}`}
            fill="none" stroke="#2d1a0e" strokeWidth={W*0.028} strokeLinecap="round"
          />
          {/* Right trunk 2 */}
          <path
            d={`M ${W*1.0},${H} C ${W*0.985},${H*0.80} ${W*0.978},${H*0.62} ${W*0.972},${H*0.44} C ${W*0.968},${H*0.30} ${W*0.965},${H*0.18} ${W*0.962},${H*0.06}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.022} strokeLinecap="round"
          />
          {/* Right branches */}
          <path
            d={`M ${W*0.905},${H*0.38} C ${W*0.88},${H*0.36} ${W*0.86},${H*0.35} ${W*0.84},${H*0.348}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.014} strokeLinecap="round"
          />
          <path
            d={`M ${W*0.908},${H*0.28} C ${W*0.93},${H*0.265} ${W*0.95},${H*0.258} ${W*0.97},${H*0.262}`}
            fill="none" stroke="#3d2210" strokeWidth={W*0.011} strokeLinecap="round"
          />
          {/* Right foliage */}
          {[
            [W*0.905, H*0.06, W*0.16, H*0.14, '#0d2e12'],
            [W*0.935, H*0.05, W*0.12, H*0.12, '#122e16'],
            [W*0.89, H*0.08, W*0.14, H*0.12, '#1a5228'],
            [W*0.96, H*0.07, W*0.10, H*0.10, '#142e18'],
            [W*0.92, H*0.04, W*0.11, H*0.10, 'url(#foliageMid)'],
            [W*0.875, H*0.10, W*0.10, H*0.09, '#1a5228'],
            [W*0.95, H*0.10, W*0.09, H*0.085, 'url(#foliageDark)'],
            [W*0.84, H*0.32, W*0.08, H*0.075, '#1e6b30'],
            [W*0.86, H*0.28, W*0.10, H*0.09, '#185c24'],
            [W*0.97, H*0.24, W*0.09, H*0.082, '#1a5228'],
          ].map(([cx, cy, rx, ry, fill], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
              fill={fill} opacity={0.85+i*0.01}/>
          ))}
          {/* Right foliage highlights */}
          {[
            [W*0.915, H*0.042, W*0.09, H*0.08],
            [W*0.945, H*0.035, W*0.07, H*0.065],
            [W*0.895, H*0.068, W*0.08, H*0.072],
          ].map(([cx, cy, rx, ry], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
              fill="#3da852" opacity={0.45}/>
          ))}
        </g>

        {/* ── BACKGROUND CENTER TREES (framing the clearing) ── */}
        {[0.38, 0.45, 0.52, 0.58, 0.64].map((xPct, i) => {
          const h = H * (0.28 + (i%3)*0.06)
          return (
            <g key={i}>
              <path
                d={`M ${W*xPct},${H*0.72} C ${W*xPct},${H*0.62} ${W*xPct},${H*0.52} ${W*xPct},${H*0.42}`}
                fill="none" stroke="#1a0e06"
                strokeWidth={W*0.008+(i%2)*W*0.003} strokeLinecap="round"
                opacity={0.8}
              />
              <ellipse
                cx={W*xPct} cy={H*0.38-h*0.1}
                rx={W*0.055+(i%3)*W*0.015} ry={h*0.28}
                fill={i%2===0 ? '#0f2812' : '#122e16'}
                opacity={0.75}
                filter="url(#blur2)"
              />
            </g>
          )
        })}

        {/* ── LAKE / WATER — grounded version ── */}

        {/* Ground shadow under lake — makes it feel embedded */}
        <ellipse cx={W * 0.65} cy={H * 0.84} rx={W * 0.42} ry={H * 0.06} fill="#050f07" opacity={0.5} />

        {/* Muddy shoreline — earthy rim around water */}
        <ellipse cx={W * 0.64} cy={H * 0.815} rx={W * 0.4} ry={H * 0.13} fill="#3d2a1a" opacity={0.7} />
        {/* Inner shore mud — lighter */}
        <ellipse cx={W * 0.64} cy={H * 0.812} rx={W * 0.385} ry={H * 0.122} fill="#5c3d22" opacity={0.5} />

        {/* Wet sand / shore closest to water */}
        <ellipse cx={W * 0.645} cy={H * 0.806} rx={W * 0.365} ry={H * 0.108} fill="#4a3518" opacity={0.45} />

        {/* Main water body */}
        <ellipse cx={W * 0.645} cy={H * 0.795} rx={W * 0.345} ry={H * 0.095} fill={skyColors.lakeColor} opacity={0.95} />

        {/* Water depth gradient — darker in center */}
        <ellipse cx={W * 0.645} cy={H * 0.792} rx={W * 0.22} ry={H * 0.058} fill="#0a2030" opacity={0.45} />

        {/* Sky reflection on water surface */}
        <ellipse cx={W * 0.6} cy={H * 0.782} rx={W * 0.16} ry={H * 0.024} fill={skyColors.reflectionColor} opacity={0.35} />

        {/* Shimmer lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M ${W * (0.38 + i * 0.04)},${H * (0.788 + i * 0.004)} C ${W * (0.48 + i * 0.03)},${H * (0.784 + i * 0.004)} ${W * (0.58 + i * 0.02)},${H * (0.784 + i * 0.004)} ${W * (0.68 + i * 0.02)},${H * (0.788 + i * 0.004)}`}
            fill="none"
            stroke="white"
            strokeWidth={1.0 - i * 0.12}
            opacity={0.08 - i * 0.01}
            strokeLinecap="round"
          />
        ))}

        {/* Ripple rings at dove drinking spot */}
        {[1, 2, 3, 4].map((i) => (
          <ellipse
            key={i}
            cx={W * 0.6}
            cy={H * 0.778}
            rx={W * 0.013 * i}
            ry={H * 0.005 * i}
            fill="none"
            stroke="#7dd3fc"
            strokeWidth={1.0 - i * 0.18}
            opacity={0.15 / i}
          />
        ))}

        {/* Lily pads — sitting on water naturally */}
        {[
          [W * 0.44, H * 0.79, W * 0.022, H * 0.008, '#1a5228'],
          [W * 0.5, H * 0.8, W * 0.018, H * 0.007, '#22703a'],
          [W * 0.82, H * 0.788, W * 0.02, H * 0.007, '#1a5228'],
          [W * 0.77, H * 0.798, W * 0.015, H * 0.006, '#15803d'],
          [W * 0.6, H * 0.806, W * 0.017, H * 0.006, '#1e6b30'],
          [W * 0.56, H * 0.794, W * 0.013, H * 0.005, '#22703a'],
        ].map(([cx, cy, rx, ry, fill], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} opacity={0.8} />
        ))}

        {/* Shore reeds — rooted at shoreline */}
        {[W * 0.35, W * 0.39, W * 0.43, W * 0.85, W * 0.89, W * 0.93].map((x, i) => (
          <g key={i}>
            <path
              d={`M ${x},${H * 0.84} C ${x - 4},${H * 0.8} ${x + 2},${H * 0.76} ${x},${H * 0.72}`}
              fill="none"
              stroke="#2d6a38"
              strokeWidth={2.8}
              strokeLinecap="round"
            />
            <path
              d={`M ${x + 9},${H * 0.845} C ${x + 6},${H * 0.8} ${x + 10},${H * 0.76} ${x + 8},${H * 0.72}`}
              fill="none"
              stroke="#245c30"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            <ellipse cx={x} cy={H * 0.718} rx={3.5} ry={9} fill="#4a7c52" opacity={0.75} />
            <ellipse cx={x + 9} cy={H * 0.718} rx={3} ry={8} fill="#3d6b44" opacity={0.7} />
          </g>
        ))}

        {/* Shore grass blending lake into ground */}
        {[-60, -40, -20, 0, 20, 40, 60, 80, 100, 120].map((offset, i) => (
          <g key={i} transform={`translate(${W * 0.645 + offset - 80},${H * 0.835})`}>
            {[-12, -7, -3, 0, 3, 7, 12].map((angle, j) => (
              <path
                key={j}
                d={`M 0,0 C ${angle * 0.4},${-H * 0.022} ${angle * 0.7},${-H * 0.042} ${angle},${-H * 0.058}`}
                fill="none"
                stroke={j % 2 === 0 ? '#2a5c30' : '#1e4a24'}
                strokeWidth={1.8 + (j % 3) * 0.4}
                strokeLinecap="round"
                opacity={0.6 + i * 0.03}
              />
            ))}
          </g>
        ))}

        {/* Water edge foam/highlight */}
        <ellipse cx={W * 0.645} cy={H * 0.703} rx={W * 0.335} ry={H * 0.012} fill="white" opacity={0.04} />

        {/* ── ATMOSPHERIC LIGHT RAYS ── */}
        {[0,1,2,3].map(i => (
          <path key={i}
            d={`M ${W*(0.35+i*0.08)},0 L ${W*(0.25+i*0.12)},${H*0.7}`}
            fill="none" stroke="#c8e6d0"
            strokeWidth={W*(0.012+i*0.004)}
            opacity={0.018-i*0.003}
            filter="url(#blur4)"
          />
        ))}

        {/* Fireflies / light particles in clearing */}
        {[...Array(15)].map((_, i) => (
          <circle key={i}
            cx={W*(0.3+i*0.04)}
            cy={H*(0.45+Math.sin(i*1.7)*0.15)}
            r={1.5+i%3*0.5}
            fill="#86efac"
            opacity={0.15+i%4*0.06}
          />
        ))}

        {/* ── DOVE (animated) ── */}
        <g ref={doveRef}>
          <ellipse cx="0" cy="0" rx="26" ry="15" fill="#f0fdf4"/>
          <ellipse cx="10" cy="3" rx="17" ry="12" fill="#f0fdf4"/>
          <circle cx="24" cy="-10" r="12" fill="#f0fdf4"/>
          <ellipse cx="17" cy="-4" rx="11" ry="9" fill="#f0fdf4"/>
          <path d="M 34,-10 L 44,-7 L 34,-4 Z" fill="#d97706"/>
          <line x1="34" y1="-7" x2="44" y2="-7" stroke="#b45309" strokeWidth="1"/>
          <circle cx="28" cy="-12" r="3" fill="#1f2a1c"/>
          <circle cx="29" cy="-13" r="1.1" fill="white"/>
          <circle cx="37" cy="-9" r="1" fill="#92400e"/>
          <path
            d="M -22,2 C -32,6 -38,13 -35,19 C -30,13 -24,9 -19,7 C -27,13 -31,20 -27,25 C -21,17 -16,12 -11,10 C -17,15 -19,22 -15,26 C -10,18 -6,13 -1,10 Z"
            fill="#e8f5e9" stroke="#c8e6c9" strokeWidth="0.6"
          />
          <path d="M -6,-3 C 3,-8 12,-10 22,-9"
            fill="none" stroke="#d1fae5" strokeWidth="2" strokeLinecap="round"/>
          <path ref={wingTopRef}
            d="M 0,0 C -15,-22 -40,-38 -48,-22 C -36,-8 -18,-2 0,0"
            fill="#dcfce7" stroke="#a7f3d0" strokeWidth="1"/>
          <path ref={wingBottomRef}
            d="M 0,0 C 12,-10 28,-20 30,-10 C 22,0 10,4 0,0"
            fill="#ecfdf5" stroke="#d1fae5" strokeWidth="1"/>
          <path d="M -36,-18 C -38,-12 -36,-7 -30,-6"
            fill="none" stroke="#a7f3d0" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M -26,-22 C -28,-16 -26,-11 -21,-10"
            fill="none" stroke="#a7f3d0" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M 5,12 L 2,22 M 2,22 L -3,27 M 2,22 L 5,27 M 2,22 L 8,27"
            fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
          <path d="M 12,12 L 10,22 M 10,22 L 5,27 M 10,22 L 13,27 M 10,22 L 16,27"
            fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
        </g>

        {/* ── RAIN ── */}
        {weather.condition === 'rain' && (
          <g opacity={0.7}>
            {rainParticles.map((p, i) => (
              <line key={i} x1={p.x} y1={p.y} x2={p.x - 3} y2={p.y + p.length} stroke="#93c5fd" strokeWidth={0.8} opacity={p.opacity} />
            ))}
            {[...Array(6)].map((_, i) => (
              <ellipse
                key={`rp-${i}`}
                cx={W * (0.44 + i * 0.06)}
                cy={H * (0.785 + i * 0.004)}
                rx={4 + i * 2}
                ry={2 + i}
                fill="none"
                stroke="#93c5fd"
                strokeWidth={0.8}
                opacity={0.2}
              />
            ))}
            <rect x="0" y="0" width={W} height={H} fill="#0a1a30" opacity={0.15} />
          </g>
        )}

        {/* ── SNOW ── */}
        {weather.condition === 'snow' && (
          <g>
            {snowParticles.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="white" opacity={p.opacity} />
            ))}
            <ellipse cx={W * 0.5} cy={H * 0.88} rx={W * 0.6} ry={H * 0.04} fill="white" opacity={0.25} />
            <ellipse cx={W * 0.18} cy={H * 0.265} rx={W * 0.08} ry={H * 0.012} fill="white" opacity={0.3} />
            <ellipse cx={W * 0.22} cy={H * 0.262} rx={W * 0.05} ry={H * 0.01} fill="white" opacity={0.25} />
            <rect x="0" y="0" width={W} height={H} fill="#e0e8f0" opacity={0.06} />
          </g>
        )}

        {/* ── CLOUDS (overcast) ── */}
        {weather.condition === 'cloudy' && (
          <g opacity={weather.intensity * 0.6}>
            {[
              [W * 0.2, H * 0.08, W * 0.18, H * 0.06],
              [W * 0.45, H * 0.06, W * 0.22, H * 0.07],
              [W * 0.72, H * 0.09, W * 0.16, H * 0.055],
              [W * 0.3, H * 0.12, W * 0.14, H * 0.05],
              [W * 0.6, H * 0.11, W * 0.18, H * 0.058],
            ].map(([cx, cy, rx, ry], i) => (
              <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="#6b7280" opacity={0.25} filter="url(#blur4)" />
            ))}
          </g>
        )}
      </svg>

      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(8px)',
          borderRadius: '999px',
          padding: '5px 12px',
          zIndex: 20,
        }}
      >
        <span style={{ fontSize: '14px' }}>
          {skyColors.isNight ? '🌙' : skyColors.isDawn || skyColors.isDusk ? '🌅' : skyColors.isMorning ? '🌤' : skyColors.isNoon ? '☀️' : '🌇'}{' '}
          {weather.condition === 'rain' ? '🌧' : weather.condition === 'snow' ? '❄️' : weather.condition === 'cloudy' ? '☁️' : ''}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.03em',
          }}
        >
          {['Winter', 'Spring', 'Summer', 'Fall'][skyColors.season]}
          {' · '}
          {String(skyColors.hour).padStart(2, '0')}:00
        </span>
      </div>

      <button
        onClick={() => {
          setMuted(prev => {
            const newMuted = !prev
            if (audioRef.current) {
              audioRef.current.muted = newMuted
            }
            return newMuted
          })
        }}
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '24px',
          zIndex: 20,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(8px)',
          border: 'none',
          borderRadius: '999px',
          padding: '6px 14px',
          color: 'rgba(255,255,255,0.75)',
          fontSize: '13px',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        onMouseEnter={e =>
          e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
        onMouseLeave={e =>
          e.currentTarget.style.background = 'rgba(0,0,0,0.35)'}
      >
        {muted ? '🔇' : '🔊'}
        <span style={{ fontSize: '11px' }}>
          {muted ? 'Unmute' : 'Mute'}
        </span>
      </button>

      {/* Verdant title and Open button */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '28px',
        zIndex: 10,
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '72px',
          fontWeight: '700',
          color: '#f0fdf4',
          margin: 0,
          letterSpacing: '-0.02em',
          textShadow: '0 2px 40px rgba(0,0,0,0.5)',
        }}>
          Verdant
        </h1>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            padding: '14px 44px',
            background: '#16a34a',
            color: 'white',
            border: 'none',
            borderRadius: '999px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            boxShadow: '0 4px 24px rgba(22,163,74,0.4)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.target.style.background = '#15803d'
            e.target.style.transform = 'translateY(-2px)'
            e.target.style.boxShadow = '0 8px 32px rgba(22,163,74,0.5)'
          }}
          onMouseLeave={e => {
            e.target.style.background = '#16a34a'
            e.target.style.transform = 'translateY(0)'
            e.target.style.boxShadow = '0 4px 24px rgba(22,163,74,0.4)'
          }}
        >
          Open
        </button>
      </div>
    </div>
  )
}
