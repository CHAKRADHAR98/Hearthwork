import Link from 'next/link'
import { cookies } from 'next/headers'
import HeroPlayer from '@/components/Landing/HeroPlayer'
import Reveal from '@/components/Landing/Reveal'
import PricingDemo from '@/components/Landing/PricingDemo'
import Sprite from '@/components/Village/Sprite'
import VillageSkyline from '@/components/Village/VillageSkyline'

const REPO = 'https://github.com/CHAKRADHAR98/Hearthwork'
const EXPLORER = 'https://testnet.nearblocks.io/address/'

const SHOPKEEPERS = [
    { name: 'Bram', title: 'Farmer', skin: '005', sells: '🌾 wheat', buys: '🔨 tools', line: '“That wheat took sweat. You city folk always want it cheap.”' },
    { name: 'Mira', title: 'Baker', skin: '012', sells: '🍞 bread', buys: '🌾 wheat', line: '“Fresh loaves! Did you hear what happened at the smithy?”' },
    { name: 'Tor', title: 'Blacksmith', skin: '020', sells: '🔨 tools', buys: '🪨 iron ore', line: '“Seven. Final. Don’t waste my time.”' },
    { name: 'Nell', title: 'Fishmonger', skin: '030', sells: '🐟 fish', buys: '🐟 your catch', line: '“Catch is poor this season, love. That’s why it costs more.”' },
    { name: 'Ivo', title: 'Tailor', skin: '040', sells: '🧵 cloth', buys: '🧶 wool', line: '“Darling, art has a price. Flattery may lower it.”' },
]

const LOOP = [
    { when: 'Every 30 seconds', icon: '⛏️', title: 'Gather', text: 'Fish at the dock, mine iron, cut wheat, shear sheep. Every haul is minted as a NEP-245 token in your wallet.' },
    { when: 'Every few minutes', icon: '🤝', title: 'Trade & haggle', text: 'Sell to whoever pays most, talk prices down in chat, take delivery jobs from shopkeepers who are short on stock.' },
    { when: 'Every session', icon: '💰', title: 'Invest & bet', text: 'Rescue bankrupt shops for a cut of their profits, bet on office predictions, chip into the team pool.' },
]

const NEAR = [
    { icon: '🪙', title: 'NEP-245 goods', text: 'Wheat, bread, iron, tools, fish, wool, cloth and coin live in one multi-token contract.', href: `${EXPLORER}items.hearthwork.testnet`, link: 'items.hearthwork.testnet' },
    { icon: '🧑‍🌾', title: 'Agents with wallets', text: 'Every shopkeeper owns a NEAR account. Their cash and stock are on-chain balances.', href: `${EXPLORER}items.hearthwork.testnet`, link: 'view balances' },
    { icon: '⚖️', title: 'Atomic trades', text: 'Your coins and their goods swap in one transaction. A trade can’t half-happen.', href: `${REPO}/blob/main/contracts/village_items/src/lib.rs`, link: 'trade()' },
    { icon: '⛽', title: 'Zero gas for players', text: 'NEP-366 meta transactions: your wallet signs, Hearthwork relays and pays the gas.', href: `${REPO}/blob/main/backend/src/village/chain.ts`, link: 'chain.ts' },
    { icon: '🧠', title: 'NEAR AI shopkeepers', text: 'Personalities and haggling run on NEAR AI Cloud, inside price limits the model can’t break.', href: `${REPO}/blob/main/backend/src/village/agents.ts`, link: 'agents.ts' },
    { icon: '🔑', title: 'Sign in with Google', text: 'No seed phrase, no wallet popup. A NEAR account is created for you on the first sign-in.', href: `${REPO}/blob/main/backend/src/auth/routes.ts`, link: '/auth/google' },
]

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-hearth-honey px-6 py-3 font-pixel text-lg text-hearth-ink shadow-[0_5px_0_#7a5a16] transition-[transform,box-shadow,background-color] hover:bg-[#ecc95a] active:translate-y-[3px] active:shadow-[0_2px_0_#7a5a16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-parchment'
const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-xl border-2 border-hearth-line px-6 py-3 font-semibold text-hearth-parchment transition-colors hover:bg-hearth-soot focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-honey'

export default function Landing() {
    const signedIn = !!cookies().get('token')?.value
    const cta = signedIn ? { href: '/app', label: 'Open your office' } : { href: '/register', label: 'Start your office' }

    return (
        <main className='min-h-screen bg-[#1a1510] text-hearth-parchment'>
            {/* nav */}
            <header className='sticky top-0 z-30 border-b border-hearth-line/60 bg-[#1a1510]/85 backdrop-blur'>
                <nav className='mx-auto flex max-w-6xl items-center gap-4 px-4 py-3'>
                    <Link href='/' className='flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-honey'>
                        <img src='/hearthwork-logo.svg' alt='' className='h-9 w-9' />
                        <span className='hidden font-pixel text-xl min-[400px]:inline'>Hearthwork</span>
                    </Link>
                    <div className='ml-6 hidden gap-5 text-sm text-hearth-sand md:flex'>
                        <a href='#loop' className='hover:text-hearth-parchment'>How it plays</a>
                        <a href='#shopkeepers' className='hover:text-hearth-parchment'>Shopkeepers</a>
                        <a href='#economy' className='hover:text-hearth-parchment'>The economy</a>
                        <a href='#near' className='hover:text-hearth-parchment'>On NEAR</a>
                    </div>
                    <div className='ml-auto flex items-center gap-2'>
                        {!signedIn && <Link href='/signin' className='whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-hearth-sand hover:text-hearth-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-honey'>Sign in</Link>}
                        <Link href={cta.href} className='whitespace-nowrap rounded-lg bg-hearth-honey px-4 py-2 text-sm font-bold text-hearth-ink hover:bg-[#ecc95a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-parchment'><span className='sm:hidden'>{signedIn ? 'Open' : 'Start'}</span><span className='hidden sm:inline'>{cta.label}</span></Link>
                    </div>
                </nav>
            </header>

            {/* hero */}
            <section className='relative overflow-hidden bg-gradient-to-b from-hearth-night via-hearth-dusk to-[#1a1510]'>
                <div className='mx-auto grid max-w-6xl items-center gap-10 px-4 pb-24 pt-14 lg:grid-cols-[1fr_1.25fr] lg:pt-20'>
                    <Reveal>
                        <p data-reveal className='inline-flex items-center gap-2 rounded-full border border-hearth-line bg-hearth-ink/70 px-3 py-1 text-xs font-semibold text-hearth-sand'>
                            <span className='h-2 w-2 rounded-full bg-hearth-leaf' /> NEAR Hackathon 2026 · Games With Real Economies
                        </p>
                        <h1 data-reveal className='mt-5 font-pixel text-5xl leading-[1.05] sm:text-6xl'>
                            Your office has a <span className='text-hearth-honey'>village</span> now.
                        </h1>
                        <p data-reveal className='mt-5 max-w-xl text-lg text-hearth-sand'>
                            Hearthwork is a pixel-art office for remote teams with a Market Square next door. Five AI shopkeepers run real shops with NEAR wallets:
                            they set prices from supply and demand, hoard, haggle, go bankrupt and hire you.
                        </p>
                        <div data-reveal className='mt-8 flex flex-wrap gap-3'>
                            <Link href={cta.href} className={btnPrimary}>{cta.label} →</Link>
                            <a href='#economy' className={btnGhost}>Try the economy</a>
                        </div>
                        <p data-reveal className='mt-4 text-sm text-hearth-sand'>Sign in with Google. No wallet, no seed phrase, no gas.</p>
                    </Reveal>
                    <div className='relative'>
                        <HeroPlayer />
                        <p className='mt-3 text-center text-xs text-hearth-sand'>Live scene rendered in your browser with Remotion</p>
                    </div>
                </div>
                <VillageSkyline className='pointer-events-none absolute bottom-0 left-0 h-24 w-full opacity-60' />
            </section>

            {/* stats */}
            <section aria-label='At a glance' className='border-y border-hearth-line/60 bg-hearth-ink'>
                <dl className='mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center md:grid-cols-4'>
                    {[['5', 'AI shopkeepers with wallets'], ['8', 'NEP-245 tokens'], ['0', 'seed phrases'], ['0', 'gas paid by players']].map(([n, l]) => (
                        <div key={l}><dt className='sr-only'>{l}</dt><dd className='font-pixel text-4xl text-hearth-honey'>{n}</dd><dd className='mt-1 text-sm text-hearth-sand'>{l}</dd></div>
                    ))}
                </dl>
            </section>

            {/* loop */}
            <Reveal as='section' id='loop' className='mx-auto max-w-6xl scroll-mt-20 px-4 py-20'>
                <h2 data-reveal className='font-pixel text-4xl'>How it plays</h2>
                <p data-reveal className='mt-2 max-w-2xl text-hearth-sand'>Take a break from work, walk to the Market Square, and play a few rounds with your team.</p>
                <div className='mt-10 grid gap-5 md:grid-cols-3'>
                    {LOOP.map(s => (
                        <article key={s.title} data-reveal className='rounded-2xl border-2 border-hearth-line bg-hearth-ink p-6 shadow-[0_6px_0_#0d0a07]'>
                            <p className='text-xs font-bold uppercase tracking-wide text-hearth-honey'>{s.when}</p>
                            <p className='mt-3 text-4xl' aria-hidden>{s.icon}</p>
                            <h3 className='mt-2 font-pixel text-2xl'>{s.title}</h3>
                            <p className='mt-2 text-hearth-sand'>{s.text}</p>
                        </article>
                    ))}
                </div>
            </Reveal>

            {/* shopkeepers */}
            <section id='shopkeepers' className='scroll-mt-20 bg-hearth-bark/60 py-20'>
                <Reveal className='mx-auto max-w-6xl px-4'>
                    <h2 data-reveal className='font-pixel text-4xl'>Meet the shopkeepers</h2>
                    <p data-reveal className='mt-2 max-w-2xl text-hearth-sand'>Each one is an agent with a personality, a NEAR wallet and a business to keep alive. They buy from each other, so the village runs even when nobody is playing.</p>
                    <div className='mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
                        {SHOPKEEPERS.map((k, i) => (
                            <article key={k.name} data-reveal className='group flex flex-col rounded-2xl border-2 border-hearth-line bg-hearth-ink p-5 transition-transform hover:-translate-y-1'>
                                <div className='hw-bob mx-auto rounded-xl bg-hearth-soot p-2' style={{ animationDelay: `${i * 0.3}s` }}>
                                    <Sprite skin={k.skin} scale={1.8} />
                                </div>
                                <h3 className='mt-3 text-center font-pixel text-2xl'>{k.name}</h3>
                                <p className='text-center text-sm text-hearth-sand'>{k.title}</p>
                                <p className='mt-3 text-sm italic text-hearth-parchment'>{k.line}</p>
                                <p className='mt-auto pt-3 text-xs text-hearth-sand'>Sells {k.sells} · buys {k.buys}</p>
                            </article>
                        ))}
                    </div>
                </Reveal>
            </section>

            {/* economy */}
            <Reveal as='section' id='economy' className='mx-auto grid max-w-6xl scroll-mt-20 items-start gap-10 px-4 py-20 lg:grid-cols-2'>
                <div>
                    <h2 data-reveal className='font-pixel text-4xl'>A real economy, not a price list</h2>
                    <ul className='mt-6 space-y-5 text-hearth-sand'>
                        <li data-reveal><b className='text-hearth-parchment'>Supply and demand.</b> Prices follow stock, the day&apos;s sales and the shopkeeper&apos;s cash. Every rule lives in one readable file, and hovering a price shows the reasoning.</li>
                        <li data-reveal><b className='text-hearth-parchment'>Hoarding and bankruptcy.</b> Low on stock, shopkeepers hold some back. Short of coins for the morning rent, they close until players invest.</li>
                        <li data-reveal><b className='text-hearth-parchment'>Hiring.</b> A smith out of ore posts a job: “bring me 9 iron for 45 coins”.</li>
                        <li data-reveal><b className='text-hearth-parchment'>Collusion.</b> Flood the market and the shopkeepers whisper a pact to lowball you, until one of them needs your goods too badly.</li>
                        <li data-reveal><b className='text-hearth-parchment'>Fast-forward.</b> One button plays a week of village life in a minute.</li>
                    </ul>
                </div>
                <div data-reveal><PricingDemo /></div>
            </Reveal>

            {/* NEAR */}
            <section id='near' className='scroll-mt-20 bg-hearth-bark/60 py-20'>
                <Reveal className='mx-auto max-w-6xl px-4'>
                    <h2 data-reveal className='font-pixel text-4xl'>Built on NEAR, invisible to players</h2>
                    <p data-reveal className='mt-2 max-w-2xl text-hearth-sand'>The chain does the bookkeeping. Players just play.</p>
                    <div className='mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                        {NEAR.map(n => (
                            <article key={n.title} data-reveal className='rounded-2xl border-2 border-hearth-line bg-hearth-ink p-6'>
                                <p className='text-3xl' aria-hidden>{n.icon}</p>
                                <h3 className='mt-2 font-pixel text-xl'>{n.title}</h3>
                                <p className='mt-2 text-sm text-hearth-sand'>{n.text}</p>
                                <a href={n.href} target='_blank' rel='noreferrer' className='mt-3 inline-block rounded text-sm font-semibold text-hearth-honey underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-honey'>{n.link} ↗</a>
                            </article>
                        ))}
                    </div>
                    <p data-reveal className='mt-8 text-sm text-hearth-sand'>
                        Also in every office: prediction markets (“Will we ship v2 by Friday?”) on <code className='text-hearth-parchment'>market.hearthwork.testnet</code> and a shared NEAR team pool on <code className='text-hearth-parchment'>pool.hearthwork.testnet</code>.
                    </p>
                </Reveal>
            </section>

            {/* office */}
            <Reveal as='section' className='mx-auto max-w-6xl px-4 py-20'>
                <div className='grid items-center gap-8 rounded-3xl border-2 border-hearth-line bg-hearth-ink p-8 md:grid-cols-[auto_1fr]'>
                    <div data-reveal className='flex gap-2'>
                        <Sprite skin='009' scale={2} /><Sprite skin='015' scale={2} facing='left' />
                    </div>
                    <div data-reveal>
                        <h2 className='font-pixel text-3xl'>Still a great place to work</h2>
                        <p className='mt-2 text-hearth-sand'>Walk up to a teammate to start a video call, step into a private room for a meeting, and design your own office in the map editor. The village is just next door.</p>
                    </div>
                </div>
            </Reveal>

            {/* final CTA */}
            <section className='relative overflow-hidden bg-gradient-to-b from-[#1a1510] to-hearth-dusk pb-40 pt-16 text-center'>
                <Reveal className='relative z-10 mx-auto max-w-2xl px-4'>
                    <h2 data-reveal className='font-pixel text-4xl sm:text-5xl'>The shopkeepers are open.</h2>
                    <p data-reveal className='mt-3 text-hearth-sand'>Bring your team. Bram has wheat to sell, and Tor really needs iron.</p>
                    <div data-reveal className='mt-8 flex flex-wrap justify-center gap-3'>
                        <Link href={cta.href} className={btnPrimary}>{cta.label} →</Link>
                        <a href={REPO} target='_blank' rel='noreferrer' className={btnGhost}>View on GitHub</a>
                    </div>
                </Reveal>
                <VillageSkyline className='absolute bottom-0 left-0 h-40 w-full' />
            </section>

            <footer className='bg-[#1a1510] py-6 text-center text-xs text-hearth-sand'>
                Built at NEAR Hackathon 2026 · <a href={REPO} className='underline hover:text-hearth-parchment'>Source (MIT)</a>
            </footer>
        </main>
    )
}
