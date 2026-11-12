import { App } from './App'
import { Player } from './Player/Player'
import { Point, RealmData, SpriteMap, TilePoint } from './types'
import * as PIXI from 'pixi.js'
import { server } from '../backend/server'
import { defaultSkin } from './Player/skins'
import signal from '../signal'
import { gsap } from 'gsap'
import { drawEntrances, VillageLayer } from './village/VillageLayer'
import { MARKET_ROOM, VILLAGE_NPCS } from '../village/data'
import { BuildSite, BuiltLandmark, ProjectView, villageStore } from '../village/client'

export class PlayApp extends App {
    private scale: number = 1.5
    public player: Player
    public blocked: Set<TilePoint> = new Set()
    public keysDown: string[] = []
    private teleportLocation: Point | null = null
    private fadeOverlay: PIXI.Graphics = new PIXI.Graphics()
    private fadeDuration: number = 0.5
    public uid: string = ''
    public realmId: string = ''
    public players: { [key: string]: Player } = {}
    private disableInput: boolean = false

    private kicked: boolean = false

    private fadeTiles: SpriteMap = {}
    private fadeTileContainer: PIXI.Container = new PIXI.Container()
    private fadeAnimation: gsap.core.Tween | null = null
    private currentPrivateAreaTiles: TilePoint[] = []
    public proximityId: string | null = null
    public village: VillageLayer | null = null

    constructor(uid: string, realmId: string, realmData: RealmData, username: string, skin: string = defaultSkin) {
        super(realmData)
        this.uid = uid
        this.realmId = realmId
        this.player = new Player(skin, this, username, true)
    }

    override async loadRoom(index: number) {
        this.players = {}
        this.village?.destroy()
        this.village = null
        await super.loadRoom(index)
        this.setUpBlockedTiles()
        this.setUpFadeTiles()
        this.spawnLocalPlayer()
        const room = this.realmData.rooms[index]
        if ((room as any).market || room.name === MARKET_ROOM) {
            // The Market Square room (customisable in the editor, see backend/src/village/marketRoom.ts).
            const positions: Record<string, { x: number, y: number }> = {}
            let exit: { x: number, y: number } | undefined
            for (const [k, t] of Object.entries(room.tilemap)) {
                const [x, y] = k.split(',').map(Number)
                if (t.villageSpot) positions[t.villageSpot] = { x, y }
                if (t.villageExit && !exit) exit = { x, y }
            }
            this.village = new VillageLayer(this, this.layers.above_floor, this.layers.object)
            await this.village.mount(VILLAGE_NPCS, positions, exit)
            const store = villageStore.get()
            if (store.buildSite?.roomIndex === index) this.village.setBuildSite(store.buildSite, store.state?.project ?? null)
        } else {
            drawEntrances(this.layers.above_floor, this.villageEntrances(index))
        }
        await this.syncOtherPlayers()
        this.displayInitialChatMessage()
    }

    private setUpFadeTiles = () => {
        this.fadeTiles = {}
        this.fadeTileContainer.removeChildren()

        for (const [key] of Object.entries(this.realmData.rooms[this.currentRoomIndex].tilemap)) {
            const [x, y] = key.split(',').map(Number)
            const screenCoordinates = this.convertTileToScreenCoordinates(x, y)
            const tile: PIXI.Sprite = new PIXI.Sprite(PIXI.Assets.get('/sprites/faded-tile.png'))
            tile.x = screenCoordinates.x
            tile.y = screenCoordinates.y
            this.fadeTileContainer.addChild(tile)
            this.fadeTiles[key as TilePoint] = tile
        }
    }

    public fadeInTiles = (privateAreaId: string) => {
        // Stop any ongoing fade animation
        if (this.fadeAnimation) {
            this.fadeAnimation.kill();
        }

        this.currentPrivateAreaTiles = []
        // get all tiles with privateAreaId
        const tiles = Object.entries(this.realmData.rooms[this.currentRoomIndex].tilemap).filter(([key, value]) => value.privateAreaId === privateAreaId)
        for (const [key] of tiles) {
            const tile = this.fadeTiles[key as TilePoint]
            tile.alpha = 0
            this.currentPrivateAreaTiles.push(key as TilePoint)
        }

        this.fadeAnimation = gsap.to(this.fadeTileContainer, { 
            alpha: 1, 
            duration: 0.25, 
            ease: 'power2.out',
            onComplete: () => {
                this.fadeAnimation = null
            }
        })
    }

    public fadeOutTiles = () => {
        // Stop any ongoing fade animation
        if (this.fadeAnimation) {
            this.fadeAnimation.kill()
        }

        this.fadeAnimation = gsap.to(this.fadeTileContainer, { 
            alpha: 0, 
            duration: 0.25, 
            ease: 'power2.in',
            onComplete: () => {
                for (const key of this.currentPrivateAreaTiles) {
                    const tile = this.fadeTiles[key]
                    tile.alpha = 1
                }
                this.fadeAnimation = null
            }
        })
    }

    private async loadAssets() {
        await Promise.all([
            PIXI.Assets.load('/fonts/silkscreen.ttf'),
            PIXI.Assets.load('/fonts/nunito.ttf'),
            PIXI.Assets.load('/sprites/faded-tile.png')
        ])
    }

    private async syncOtherPlayers() {
        const {data, error} = await server.getPlayersInRoom(this.currentRoomIndex)
        if (error) {
            console.error('Failed to get player positions in room:', error)
            return
        }

        for (const player of data.players) {
            if (player.uid === this.uid) continue
            this.updatePlayer(player.uid, player)
        }

        this.sortObjectsByY()
    }

    private async updatePlayer(uid: string, player: any) {
        if (uid in this.players) {
            if (this.players[uid].skin !== player.skin) {
                await this.players[uid].changeSkin(player.skin)
            }
            if (this.players[uid].currentTilePosition.x !== player.x || this.players[uid].currentTilePosition.y !== player.y) {
                this.players[uid].setPosition(player.x, player.y)
            }
        } else {
            await this.spawnPlayer(player.uid, player.skin, player.username, player.x, player.y)
        }
    }

    private async spawnPlayer(uid: string, skin: string, username: string, x: number, y: number) {
        const otherPlayer = new Player(skin, this, username)
        await otherPlayer.init()
        otherPlayer.setPosition(x, y)
        this.layers.object.addChild(otherPlayer.parent)
        this.players[uid] = otherPlayer
        otherPlayer.setHat(villageStore.get().hats[uid] ?? null)
        this.sortObjectsByY()
    }

    public async init() {
        await super.init()
        await this.loadAssets()
        await this.loadRoom(this.realmData.spawnpoint.roomIndex)
        this.app.stage.eventMode = 'static'
        this.setScale(this.scale)
        this.app.renderer.on('resize', this.resizeEvent)
        this.fadeTileContainer.alpha = 0
        this.app.stage.addChild(this.fadeTileContainer)
        this.clickEvents()
        this.setUpKeyboardEvents()
        this.setUpFadeOverlay()
        this.setUpSignalListeners()
        this.setUpSocketEvents()

        this.fadeOut()
    }

    private spawnLocalPlayer = async () => {
        await this.player.init()

        if (this.teleportLocation) {
            this.player.setPosition(this.teleportLocation.x, this.teleportLocation.y)
        } else {
            this.player.setPosition(this.realmData.spawnpoint.x, this.realmData.spawnpoint.y)
        }
        this.layers.object.addChild(this.player.parent)
        this.player.setHat(villageStore.get().hats[this.uid] ?? null)
        this.moveCameraToPlayer()
    }

    private setScale = (newScale: number) => {
        this.scale = newScale
        this.app.stage.scale.set(this.scale)
    }

    public moveCameraToPlayer = () => {
        const x = this.player.parent.x - (this.app.screen.width / 2) / this.scale
        const y = this.player.parent.y - (this.app.screen.height / 2) / this.scale
        this.app.stage.pivot.set(x, y)
        this.updateFadeOverlay(x, y)
    }

    private updateFadeOverlay = (x: number, y: number) => {
        this.fadeOverlay.clear()
        this.fadeOverlay.rect(0, 0, this.app.screen.width * (1 / this.scale), this.app.screen.height * (1 / this.scale))
        this.fadeOverlay.fill(0x0F0F0F)
        this.fadeOverlay.pivot.set(-x, -y)
    }

    private resizeEvent = () => {
        this.moveCameraToPlayer()
    }

    private setUpFadeOverlay = () => {
        this.fadeOverlay.rect(0, 0, this.app.screen.width * (1 / this.scale), this.app.screen.height * (1 / this.scale))
        this.fadeOverlay.fill(0x0F0F0F)
        this.app.stage.addChild(this.fadeOverlay)
    }

    private setUpBlockedTiles = () => {
        this.blocked = new Set<TilePoint>()

        for (const [key, value] of Object.entries(this.realmData.rooms[this.currentRoomIndex].tilemap)) {
            if (value.impassable) {
                this.blocked.add(key as TilePoint)
            }
        }

        for (const [key, value] of Object.entries(this.collidersFromSpritesMap)) {
            if (value) {
                this.blocked.add(key as TilePoint)
            }
        }
    }

    private clickEvents = () => {
        this.app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            if (this.player.frozen || this.disableInput) return  

            const clickPosition = e.getLocalPosition(this.app.stage)
            const { x, y } = this.convertScreenToTileCoordinates(clickPosition.x, clickPosition.y)
            this.player.moveToTile(x, y)
            this.player.setMovementMode('mouse')
        })
    }

    private setUpKeyboardEvents = () => {
        document.addEventListener('keydown', this.keydown)
        document.addEventListener('keyup', this.keyup)
    }

    private keydown = (event: KeyboardEvent) => {
        if (this.keysDown.includes(event.key) || this.disableInput) return
        this.player.keydown(event)
        this.keysDown.push(event.key)
    }

    private keyup = (event: KeyboardEvent) => {
        this.keysDown = this.keysDown.filter((key) => key !== event.key)
    }

    public teleportIfOnTeleportSquare = (x: number, y: number) => {
        const tile = `${x}, ${y}` as TilePoint
        const teleport = this.realmData.rooms[this.currentRoomIndex].tilemap[tile]?.teleporter
        if (teleport) {
            this.teleport(teleport.roomIndex, teleport.x, teleport.y)
            return true
        }
        return false
    }

    private teleport = async (roomIndex: number, x: number, y: number) => {
        this.player.setFrozen(true)
        await this.fadeIn()
        if (this.currentRoomIndex === roomIndex) {
            this.player.setPosition(x, y)
            this.moveCameraToPlayer()
        } else {
            this.teleportLocation = { x, y }
            this.currentRoomIndex = roomIndex
            this.player.changeAnimationState('idle_down')
            await this.loadRoom(roomIndex)
        }

        server.socket.emit('teleport', { x, y, roomIndex })

        this.player.setFrozen(false)
        this.fadeOut()
    }

    public hasTeleport = (x: number, y: number) => {
        const tile = `${x}, ${y}` as TilePoint
        return this.realmData.rooms[this.currentRoomIndex].tilemap[tile]?.teleporter
    }

    private fadeIn = () => {
        PIXI.Ticker.shared.remove(this.fadeOutTicker)
        this.fadeOverlay.alpha = 0
        return new Promise<void>((resolve) => {
            const fadeTicker = ({ deltaTime }: { deltaTime: number }) => {
                this.fadeOverlay.alpha += (deltaTime / 60) / this.fadeDuration
                if (this.fadeOverlay.alpha >= 1) {
                    this.fadeOverlay.alpha = 1
                    PIXI.Ticker.shared.remove(fadeTicker)
                    resolve()
                }
            }

            PIXI.Ticker.shared.add(fadeTicker)
        })
    }

    private fadeOut = () => {
        PIXI.Ticker.shared.add(this.fadeOutTicker)
    }

    private fadeOutTicker = ({ deltaTime }: { deltaTime: number }) => {
        this.fadeOverlay.alpha -= (deltaTime / 60) / this.fadeDuration
        if (this.fadeOverlay.alpha <= 0) {
            this.fadeOverlay.alpha = 0
            PIXI.Ticker.shared.remove(this.fadeOutTicker)
        }
    }

    private destroyPlayers = () => {
        for (const player of Object.values(this.players)) {
            player.destroy()
        }
        this.player.destroy()
    }

    private onPlayerLeftRoom = (uid: string) => {
        if (this.players[uid]) {
            this.players[uid].destroy()
            this.layers.object.removeChild(this.players[uid].parent)
            delete this.players[uid]
        }
    }

    private onPlayerJoinedRoom = (playerData: any) => {
        this.updatePlayer(playerData.uid, playerData)
    }

    private onPlayerMoved = (data: any) => {
        if (this.blocked.has(`${data.x}, ${data.y}`)) return

        const player = this.players[data.uid]
        if (player) {
            player.moveToTile(data.x, data.y)
        }
    }

    private onPlayerTeleported = (data: any) => {
        const player = this.players[data.uid]
        if (player) {
            player.setPosition(data.x, data.y)
        }
    }

    private onPlayerChangedSkin = (data: any) => {
        const player = this.players[data.uid]
        if (player) {
            player.changeSkin(data.skin)
        }
        signal.emit('video-skin', {
            skin: data.skin,
            uid: data.uid,
        })
    }

    private onVillageSay = (m: { shopId: string, text: string }) => this.village?.say(m.shopId, m.text)
    private onVillageShops = (shops: { id: string, open: boolean }[]) => this.village?.updateShops(VILLAGE_NPCS.map(n => ({ ...n, open: shops.find(s => s.id === n.id)?.open ?? true })))
    /** Market Square entrance tiles in a room. */
    public villageEntrances(index = this.currentRoomIndex) {
        return Object.entries(this.realmData.rooms[index].tilemap)
            .filter(([, t]) => (t as any).villageId)
            .map(([k]) => { const [x, y] = k.split(',').map(Number); return { x, y } })
    }

    private onVillageWalk = () => {
        if (this.village) return this.village.walkHere()
        // in the office: walk to the nearest entrance; stepping on it teleports into the Market Square
        const p = this.player.currentTilePosition
        const target = this.villageEntrances().sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)))[0]
        if (target) this.player.moveToTile(target.x, target.y)
    }

    private onVillageHat = (h: { uid: string, hat: string | null }) => {
        if (h.uid === this.uid) this.player.setHat(h.hat)
        else this.players[h.uid]?.setHat(h.hat)
    }

    /** "+3 🌾" floating up from the local player. */
    private onVillageFloat = (f: { text: string, color?: number }) => {
        const t = new PIXI.Text({ text: f.text, style: { fontFamily: 'silkscreen', fontSize: 128, fill: f.color ?? 0xfff3d6, stroke: { color: 0x1f1913, width: 18 } } })
        t.scale.set(0.09)
        t.anchor.set(0.5, 1)
        t.x = this.player.parent.x
        t.y = this.player.parent.y - 44
        t.zIndex = 100000
        this.layers.object.addChild(t)
        gsap.to(t, { y: t.y - 34, duration: 1.4, ease: 'power1.out' })
        gsap.to(t, { alpha: 0, duration: 0.5, delay: 0.9, onComplete: () => t.destroy() })
    }

    /** The office finished a team project: its landmark appears on the map right away. */
    private onVillageBuilt = async (b: BuiltLandmark) => {
        if (b.sprite && b.roomIndex !== undefined && b.x !== undefined && b.y !== undefined) {
            const key = `${b.x}, ${b.y}` as TilePoint
            const room = this.realmData.rooms[b.roomIndex]
            room.tilemap[key] = { ...(room.tilemap[key] ?? {}), object: b.sprite }
            if (this.currentRoomIndex === b.roomIndex) {
                await this.placeTileFromJson(b.x, b.y, 'object', b.sprite)
                this.setUpBlockedTiles()
                this.sortObjectsByY()
            }
        }
        if (this.village) this.village.setBuildSite(b.nextSite && b.nextSite.roomIndex === this.currentRoomIndex ? b.nextSite : null, villageStore.get().state?.project ?? null)
    }

    private onVillageProject = (p: ProjectView) => this.village?.updateProject(p)

    private onVillageBuildSite = (site: BuildSite | null) => {
        if (this.village) this.village.setBuildSite(site && site.roomIndex === this.currentRoomIndex ? site : null, villageStore.get().state?.project ?? null)
    }

    private setUpSignalListeners = () => {
        signal.on('villageHat', this.onVillageHat)
        signal.on('villageFloat', this.onVillageFloat)
        signal.on('villageBuilt', this.onVillageBuilt)
        signal.on('villageProject', this.onVillageProject)
        signal.on('villageBuildSite', this.onVillageBuildSite)
        signal.on('villageSay', this.onVillageSay)
        signal.on('villageShops', this.onVillageShops)
        signal.on('villageWalk', this.onVillageWalk)
        signal.on('requestSkin', this.onRequestSkin)
        signal.on('switchSkin', this.onSwitchSkin)
        signal.on('disableInput', this.onDisableInput)
        signal.on('message', this.onMessage)
        signal.on('getSkinForUid', this.getSkinForUid)
    }

    private removeSignalListeners = () => {
        signal.off('villageHat', this.onVillageHat)
        signal.off('villageFloat', this.onVillageFloat)
        signal.off('villageBuilt', this.onVillageBuilt)
        signal.off('villageProject', this.onVillageProject)
        signal.off('villageBuildSite', this.onVillageBuildSite)
        signal.off('villageSay', this.onVillageSay)
        signal.off('villageShops', this.onVillageShops)
        signal.off('villageWalk', this.onVillageWalk)
        signal.off('requestSkin', this.onRequestSkin)
        signal.off('switchSkin', this.onSwitchSkin)
        signal.off('disableInput', this.onDisableInput)
        signal.off('message', this.onMessage)
        signal.off('getSkinForUid', this.getSkinForUid)
    }

    private onRequestSkin = () => {
        signal.emit('skin', this.player.skin)
    }

    private onSwitchSkin = (skin: string) => {
        this.player.changeSkin(skin)
        server.socket.emit('changedSkin', skin)
    }

    private getSkinForUid = (uid: string) => {
        const player = this.players[uid]
        if (!player) return

        signal.emit('video-skin', {
            skin: player.skin,
            uid: uid,
        })
    }

    private onDisableInput = (disable: boolean) => {
        this.disableInput = disable
        this.keysDown = []
    }

    private onKicked = (message: string) => {
        this.kicked = true
        this.removeEvents()
        signal.emit('showKickedModal', message)
    }

    private onDisconnect = () => {
        this.removeEvents()
        if (!this.kicked) {
            signal.emit('showDisconnectModal')
        }
    }

    private onMessage = (message: string) => {
        this.player.setMessage(message)
        server.socket.emit('sendMessage', message)
    }

    private onReceiveMessage = (data: any) => {
        const player = this.players[data.uid]
        if (player) {
            player.setMessage(data.message)
        }
    }

    private displayInitialChatMessage = async () => {
        let channelName = ''

        signal.emit('newRoomChat', {
            name: this.realmData.rooms[this.currentRoomIndex].name,
            channelId: channelName
        })
    }

    private onProximityUpdate = (data: any) => {
        this.proximityId = data.proximityId
        if (this.proximityId) {
            this.player.checkIfShouldJoinChannel(this.player.currentTilePosition)
        }
    }

    private setUpSocketEvents = () => {
        server.socket.on('playerLeftRoom', this.onPlayerLeftRoom)
        server.socket.on('playerJoinedRoom', this.onPlayerJoinedRoom)
        server.socket.on('playerMoved', this.onPlayerMoved)
        server.socket.on('playerTeleported', this.onPlayerTeleported)
        server.socket.on('playerChangedSkin', this.onPlayerChangedSkin)
        server.socket.on('receiveMessage', this.onReceiveMessage)
        server.socket.on('disconnect', this.onDisconnect)
        server.socket.on('kicked', this.onKicked)
        server.socket.on('proximityUpdate', this.onProximityUpdate)
    }

    private removeSocketEvents = () => {
        server.socket.off('playerLeftRoom', this.onPlayerLeftRoom)
        server.socket.off('playerJoinedRoom', this.onPlayerJoinedRoom)
        server.socket.off('playerMoved', this.onPlayerMoved)
        server.socket.off('playerTeleported', this.onPlayerTeleported)
        server.socket.off('playerChangedSkin', this.onPlayerChangedSkin)
        server.socket.off('receiveMessage', this.onReceiveMessage)
        server.socket.off('disconnect', this.onDisconnect)
        server.socket.off('kicked', this.onKicked)
        server.socket.off('proximityUpdate', this.onProximityUpdate)
    }

    private removeEvents = () => {
        this.removeSocketEvents()
        this.destroyPlayers()
        server.disconnect()

        PIXI.Ticker.shared.destroy()

        this.removeSignalListeners()
        document.removeEventListener('keydown', this.keydown)
        document.removeEventListener('keyup', this.keyup)
    }

    public destroy() {
        this.village?.destroy()
        this.removeEvents()
        super.destroy()
    }
}