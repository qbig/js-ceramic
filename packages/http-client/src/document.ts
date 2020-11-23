import {
  Context, DocOpts, DocParams, DocState, Doctype, DoctypeHandler, DoctypeUtils
} from "@ceramicnetwork/common"

import DocID from '@ceramicnetwork/docid'

import { fetchJson, typeDocID, delay } from './utils'
import { CeramicClientConfig } from "./ceramic-http-client"

class Document extends Doctype {

  private _syncEnabled: boolean
  private readonly _syncInterval: number

  public doctypeHandler: DoctypeHandler<Doctype>

  constructor (state: DocState, context: Context, private _apiUrl: string, config: CeramicClientConfig = { docSyncEnabled: false }) {
    super(state, context)

    this._syncEnabled = config.docSyncEnabled
    this._syncInterval = config.docSyncInterval

    if (this._syncEnabled) {
      this._syncPeriodically() // start syncing
    }
  }

  /**
   * Sync document states periodically
   * @private
   */
  async _syncPeriodically() {
    const _syncState = async () => {
      const { state } = await fetchJson(this._apiUrl + '/document/' + this.id.toString())

      if (JSON.stringify(DoctypeUtils.serializeState(this.state)) !== JSON.stringify(state)) {
        this.state = DoctypeUtils.deserializeState(state)
        this.emit('change')
      }
    }

    while (this._syncEnabled) {
      try {
        await _syncState()
      } catch (e) {
        // failed to sync state
      }
      await delay(this._syncInterval)
    }
  }

  get id(): DocID {
    return new DocID(this.state.doctype, this.state.log[0].cid)
  }

  static async createFromGenesis (apiUrl: string, doctype: string, genesis: any, context: Context, opts: DocOpts = {}, config: CeramicClientConfig): Promise<Document> {
    const { state } = await fetchJson(apiUrl + '/document', {
      method: 'put',
      body: {
        doctype,
        genesis: DoctypeUtils.serializeRecord(genesis),
        docOpts: {
          applyOnly: opts.applyOnly,
        }
      }
    })
    return new Document(DoctypeUtils.deserializeState(state), context, apiUrl, config)
  }

  static async applyRecord(apiUrl: string, docId: DocID | string, record: any, context: Context, opts: DocOpts = {}): Promise<Document> {
    docId = typeDocID(docId)
    const { state } = await fetchJson(apiUrl + '/document', {
      method: 'post',
      body: {
        docId: docId.toString(),
        record: DoctypeUtils.serializeRecord(record),
        docOpts: {
          applyOnly: opts.applyOnly,
        }
      }
    })
    return new Document(DoctypeUtils.deserializeState(state), context, apiUrl)
  }

  static async load (docId: DocID | string, apiUrl: string, context: Context, config: CeramicClientConfig): Promise<Document> {
    docId = typeDocID(docId)
    const { state } = await fetchJson(apiUrl + '/document/' + docId.toString())
    return new Document(DoctypeUtils.deserializeState(state), context, apiUrl, config)
  }

  static async loadDocumentRecords (docId: DocID | string, apiUrl: string): Promise<Array<Record<string, any>>> {
    docId = typeDocID(docId)
    const { records } = await fetchJson(apiUrl + '/records/' + docId.toString())

    return records.map((r: any) => {
      return {
        cid: r.cid, value: DoctypeUtils.deserializeRecord(r.value)
      }
    })
  }

  async change(params: DocParams): Promise<void> {
    const doctype = new this.doctypeHandler.doctype(this.state, this.context)

    await doctype.change(params)
    this.state = doctype.state
  }

  close(): void {
    this._syncEnabled = false
  }
}

export default Document
