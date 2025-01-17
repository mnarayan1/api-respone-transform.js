import crypto from "crypto";
import _ from "lodash";

function hash(string: string) {
  return crypto.createHash("md5").update(string).digest("hex");
}

class RecordNode {
  original: string;
  normalizedInfo: NodeNormalizerResultObj;
  _qNode: QNode;
  _apiLabel: string;

  constructor(node: FrozenNode | VerboseFrozenNode | MinimalFrozenNode, qNode: QNode) {
    this.original = node.original;
    this.normalizedInfo = node.normalizedInfo ? node.normalizedInfo : this.makeFakeInfo(node);
    this._qNode = qNode;
    this._apiLabel = node.apiLabel;
  }

  makeFakeInfo(node: FrozenNode | VerboseFrozenNode | MinimalFrozenNode): NodeNormalizerResultObj {
    return {
      primaryID: node.curie,
      equivalentIDs: node.equivalentCuries ?? [],
      label: node.label,
      labelAliases: node.names,
      primaryTypes: [node.semanticType],
      semanticTypes: node.semanticTypes ?? [],
      attributes: node.attributes ?? {},
    };
  }

  toJSON(): VerboseFrozenNode {
    return {
      original: this.original,
      normalizedInfo: this.normalizedInfo,
      qNodeID: this.qNodeID,
      isSet: this.isSet,
      curie: this.curie,
      UMLS: this.UMLS,
      semanticType: this.semanticType,
      semanticTypes: this.semanticTypes,
      label: this.label,
      apiLabel: this._apiLabel,
      equivalentCuries: this.equivalentCuries,
      names: this.names,
      attributes: this.attributes,
    };
  }

  freeze(): FrozenNode {
    const node = this.toJSON() as FrozenNode;
    delete node.normalizedInfo;
    delete node.equivalentCuries;
    delete node.names;
    return node;
  }

  freezeVerbose(): VerboseFrozenNode {
    return this.toJSON();
  }

  freezeMinimal(): MinimalFrozenNode {
    return {
      original: this.original,
      normalizedInfo: this.normalizedInfo,
      apiLabel: this._apiLabel,
    };
  }

  get qNodeID(): string {
    return this._qNode.getID();
  }

  get isSet(): boolean {
    return this._qNode.isSet();
  }

  get curie(): string {
    return this.normalizedInfo?.primaryID;
  }

  get UMLS(): string[] {
    return (
      this.normalizedInfo?.equivalentIDs.reduce((arr: string[], curie: string) => {
        if (curie.includes("UMLS")) arr.push(curie.replace("UMLS:", ""));
        return arr;
      }, []) ?? []
    );
  }

  get semanticType(): string[] {
    return this.normalizedInfo?.primaryTypes.map(semanticType => `biolink:${semanticType}`) ?? [];
  }

  get semanticTypes(): string[] {
    return this.normalizedInfo?.semanticTypes.map(semanticType => `biolink:${semanticType}`) ?? [];
  }

  get label(): string {
    if (this.normalizedInfo?.label === this.curie) return this._apiLabel;
    return this.normalizedInfo?.label ?? this._apiLabel;
  }

  get equivalentCuries(): string[] {
    return this.normalizedInfo?.equivalentIDs ?? [];
  }

  get names(): string[] {
    return this.normalizedInfo?.labelAliases ?? [];
  }

  get attributes(): any {
    return this.normalizedInfo?.attributes ?? {};
  }
}

export class Record {
  association: Association;
  qEdge: QEdge;
  config: any;
  subject: RecordNode;
  object: RecordNode;
  reverseToExecution: boolean;
  _qualifiers: BulkQualifiers;
  mappedResponse: MappedResponse;

  constructor(
    record: FrozenRecord | VerboseFrozenRecord | MinimalFrozenRecord,
    config?: any,
    apiEdge?: Association,
    qEdge?: QEdge,
    reverse?: boolean,
  ) {
    this.association = apiEdge ? apiEdge : this.makeAPIEdge(record);
    this.qEdge = qEdge ? qEdge : this.makeFakeQEdge(record);
    this.config = config ? config : { EDGE_ATTRIBUTES_USED_IN_RECORD_HASH: [] };
    this.reverseToExecution = reverse || false;
    if (!this.reverseToExecution) {
      this.subject = new RecordNode(record.subject, this.qEdge.getInputNode());
      this.object = new RecordNode(record.object, this.qEdge.getOutputNode());
    } else {
      this.subject = new RecordNode(record.subject, this.qEdge.getOutputNode());
      this.object = new RecordNode(record.object, this.qEdge.getInputNode());
    }
    this._qualifiers = record.qualifiers || this.association.qualifiers;
    this.mappedResponse = record.mappedResponse ? record.mappedResponse : {};
    if (!this.mappedResponse.publications) {
      this.mappedResponse.publications = record.publications;
    }
  }

  reverse() {
    const frozen = { ...this.freezeVerbose() };
    const reversedAPIEdge: Association = { ...frozen.association };
    reversedAPIEdge.input_id = frozen.association.output_id;
    reversedAPIEdge.input_type = frozen.association.output_type;
    reversedAPIEdge.output_id = frozen.association.input_id;
    reversedAPIEdge.output_type = frozen.association.input_type;
    const predicate = this.qEdge.getReversedPredicate(frozen.association.predicate);
    reversedAPIEdge.predicate = predicate;
    if (reversedAPIEdge.qualifiers) {
      const reversedQualifiers = Object.fromEntries(
        Object.entries(reversedAPIEdge.qualifiers).map(([qualifierType, qualifier]) => {
          let newQualifierType: string = qualifierType;
          let newQualifier: string = qualifier;
          if (qualifierType.includes("predicate")) {
            newQualifier = `biolink:${this.qEdge.getReversedPredicate(qualifier.replace("biolink:", ""))}`;
          }
          if (qualifierType.includes("subject")) {
            newQualifierType = qualifierType.replace("subject", "object");
          }
          if (qualifierType.includes("object")) {
            newQualifierType = qualifierType.replace("object", "subject");
          }
          return [newQualifierType, newQualifier];
        }),
      );

      reversedAPIEdge.qualifiers = reversedQualifiers;
      frozen.qualifiers = reversedQualifiers;
    }
    // frozen.predicate = 'biolink:' + predicate;
    frozen.association = reversedAPIEdge;
    const temp = frozen.subject;
    frozen.subject = frozen.object;
    frozen.object = temp;
    return new Record(frozen, this.config, frozen.association, this.qEdge, !this.reverseToExecution);
  }

  queryDirection() {
    if (!this.qEdge.isReversed()) {
      return this;
    } else {
      return this.reverse();
    }
  }

  // for user-made records lacking qEdge
  protected makeFakeQEdge(record: FrozenRecord | VerboseFrozenRecord | MinimalFrozenRecord): QEdge {
    return {
      getID(): string {
        return "fakeEdge";
      },
      getInputNode(): QNode {
        return {
          getID(): string {
            return record.subject.qNodeID;
          },
          isSet(): boolean {
            return record.subject.isSet || false;
          },
        };
      },
      getOutputNode(): QNode {
        return {
          getID(): string {
            return record.object.qNodeID;
          },
          isSet(): boolean {
            return record.object.isSet || false;
          },
        };
      },
      isReversed(): boolean {
        return false;
      },
      // WARNING not useable alongside actual QEdge.getHashedEdgeRepresentation
      // However the two should never show up together as this is only for testing purposes
      getHashedEdgeRepresentation(): string {
        return hash(
          record.subject.semanticType +
            record.predicate +
            record.object.semanticType +
            (record.subject.equivalentCuries || record.object.equivalentCuries),
        );
      },
    };
  }

  protected makeAPIEdge(record: FrozenRecord | VerboseFrozenRecord | MinimalFrozenRecord): Association {
    return {
      predicate: record.predicate?.replace("biolink:", ""),
      qualifiers: record.qualifiers
        ? Object.fromEntries(
            Object.entries(record.qualifiers).map(([qualifierType, qualifier]: [string, string]) => {
              return [qualifierType.replace("biolink:", ""), qualifier];
            }),
          )
        : undefined,
      api_name: record.api,
      source: record.metaEdgeSource,
      "x-translator": {
        infores: record.apiInforesCurie,
      },
      apiIsPrimaryKnowledgeSource: false,
    };
  }

  public static freezeRecords(records: Record[]): FrozenRecord[] {
    return records.map((record: Record): FrozenRecord => record.freeze());
  }

  public static unfreezeRecords(records: FrozenRecord[], config?: any): Record[] {
    return records.map((record: FrozenRecord): Record => new Record(record, config));
  }

  public static packRecords(records: Record[]): RecordPackage {
    // save string space by storing apiEdge and recordNode .normalizedInfo's separately (eliminates duplicates)
    const frozenRecords = [];
    const apiEdgeHashes = [];
    const apiEdges = [];
    records.forEach((record: Record, i: number) => {
      const frozenRecord = record.freezeMinimal();

      const apiEdgeHash = hash(JSON.stringify(record.association));

      let apiEdgeHashIndex = apiEdgeHashes.findIndex(hash => hash === apiEdgeHash);

      if (apiEdgeHashIndex === -1) {
        apiEdgeHashes.push(apiEdgeHash);
        apiEdges.push(record.association);
        apiEdgeHashIndex = apiEdgeHashes.length - 1;
      }

      frozenRecords.push({
        ...frozenRecord,
        apiEdge: apiEdgeHashIndex,
      });
    });

    return [apiEdges, ...frozenRecords];
  }

  public static unpackRecords(recordPack: RecordPackage, qEdge: QEdge, config?: any): Record[] {
    const [apiEdges, ...frozenRecords] = recordPack;
    return frozenRecords.map((record: any): Record => {
      const apiEdge = apiEdges[record.apiEdge];
      return new Record(record, config, apiEdge, qEdge);
    });
  }

  toJSON(): VerboseFrozenRecord {
    return {
      subject: this.subject.freezeVerbose(),
      object: this.object.freezeVerbose(),
      association: this.association,
      predicate: this.predicate,
      qualifiers: this.qualifiers,
      publications: this.publications,
      recordHash: this.recordHash,
      api: this.api,
      apiInforesCurie: this.apiInforesCurie,
      metaEdgeSource: this.metaEdgeSource,
      mappedResponse: this.mappedResponse,
    };
  }

  freeze(): FrozenRecord {
    const record = this.toJSON() as FrozenRecord;
    record.subject = this.subject.freeze();
    record.object = this.object.freeze();
    //@ts-ignore
    delete record.association;
    record.mappedResponse = {
      ...record.mappedResponse,
      publications: undefined,
    };
    return record;
  }

  freezeVerbose(): VerboseFrozenRecord {
    return this.toJSON();
  }

  freezeMinimal(): MinimalFrozenRecord {
    return {
      subject: this.subject.freezeMinimal(),
      object: this.object.freezeMinimal(),
      qualifiers: this.qualifiers,
      publications: this.publications,
      mappedResponse: this.mappedResponse,
    };
  }

  protected _getFlattenedEdgeAttributes(attributes: EdgeAttribute[]): EdgeAttribute[] {
    return attributes
      ? attributes.reduce((arr: EdgeAttribute[], attribute: EdgeAttribute) => {
          attribute.attributes
            ? arr.push(attribute, ...this._getFlattenedEdgeAttributes(attribute.attributes))
            : arr.push(attribute);
          return arr;
        }, [])
      : [];
  }

  protected get _configuredEdgeAttributesForHash(): string {
    return this._getFlattenedEdgeAttributes(this.mappedResponse["edge-attributes"])
      .filter(attribute => {
        return this.config?.EDGE_ATTRIBUTES_USED_IN_RECORD_HASH?.includes(attribute.attribute_type_id);
      })
      .reduce((acc, attribute) => {
        return [...acc, `${attribute.attribute_type_id}:${attribute.value}`];
      }, [])
      .join(",");
  }

  protected get _recordHashContent(): string {
    return [
      this.subject.curie,
      this.predicate,
      this.object.curie,
      Object.entries(this.qualifiers)
        .sort(([qTa, qVa], [qTb, qVb]) => qTa.localeCompare(qTb))
        .reduce((str, [qualifierType, qualifierValue]) => `${str};${qualifierType}:${qualifierValue}`, ""),
      this.api,
      this.metaEdgeSource,
      this._configuredEdgeAttributesForHash,
    ].join("-");
  }

  get recordHash(): string {
    return hash(this._recordHashContent);
  }

  get predicate(): string {
    return "biolink:" + this.association.predicate;
  }

  get qualifiers(): BulkQualifiers {
    if (!this._qualifiers) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(this._qualifiers).map(([qualifierType, qualifier]) => {
        const newQualifierType = `biolink:${qualifierType.replace("biolink:", "")}`;
        let newQualifier = qualifier;
        if (qualifierType.includes("predicate")) {
          newQualifier = `biolink:${qualifier.replace("biolink:", "")}`;
        }
        return [newQualifierType, newQualifier];
      }),
    );
  }

  get api(): string {
    return this.association.api_name;
  }

  get apiInforesCurie(): string {
    if (this.association["x-translator"]) {
      return this.association["x-translator"]["infores"] || undefined;
    }
    return undefined;
  }

  get metaEdgeSource(): string {
    return this.association.source;
  }

  get provenanceChain(): ProvenanceChainItem[] {
    let returnValue: ProvenanceChainItem[] = [];
    if (this.mappedResponse.trapi_sources) {
      returnValue = _.cloneDeep(this.mappedResponse.trapi_sources);
    } else {
      returnValue.push({
        resource_id: this.association.apiIsPrimaryKnowledgeSource ? this.apiInforesCurie : this.metaEdgeSource,
        resource_role: "primary_knowledge_source",
      });
      if (!this.association.apiIsPrimaryKnowledgeSource) {
        returnValue.push({
          resource_id: this.apiInforesCurie,
          resource_role: "aggregator_knowledge_source",
          upstream_resource_ids: [this.metaEdgeSource],
        });
      }
    }
    returnValue.push({
      resource_id: this.config.provenanceUsesServiceProvider
        ? "infores:service-provider-trapi"
        : "infores:biothings-explorer",
      resource_role: "aggregator_knowledge_source",
      upstream_resource_ids: [this.apiInforesCurie],
    });
    return returnValue;
  }

  get publications(): string[] {
    return this.mappedResponse.publications || [];
  }
}

export interface FrozenRecord {
  subject: FrozenNode;
  object: FrozenNode;
  predicate?: string; // not required if given apiEdge, qEdge
  qualifiers?: BulkQualifiers;
  publications?: string[]; // not required if given apiEdge, qEdge
  recordHash?: string; // always supplied by Record, not required from user
  api?: string; // not required if given apiEdge, qEdge
  apiInforesCurie?: string; // not required if given apiEdge, qEdge
  metaEdgeSource?: string; // not required if given apiEdge, qEdge
  mappedResponse?: MappedResponse;
}

export interface VerboseFrozenRecord {
  subject: VerboseFrozenNode;
  object: VerboseFrozenNode;
  association: Association;
  predicate?: string; // not required if given apiEdge, qEdge
  qualifiers: BulkQualifiers;
  publications?: string[]; // not required if given apiEdge, qEdge
  recordHash?: string; // always supplied by Record, not required from user
  api?: string; // not required if given apiEdge, qEdge
  apiInforesCurie?: string; // not required if given apiEdge, qEdge
  metaEdgeSource?: string; // not required if given apiEdge, qEdge
  mappedResponse?: MappedResponse;
}

// removes all computed values on assumption that apiEdge and qEdge are saved elsewhere
interface MinimalFrozenRecord {
  subject: VerboseFrozenNode | MinimalFrozenNode;
  object: VerboseFrozenNode | MinimalFrozenNode;
  publications?: string[]; // not always present
  mappedResponse?: MappedResponse;
  [additionalProperties: string]: any;
}

interface FrozenNode {
  // less verbose, loses extra information from nodeNormalizer
  original: string;
  qNodeID: string;
  isSet: boolean;
  curie: string;
  UMLS: string[];
  semanticType: string[];
  label: string;
  apiLabel?: string;
  attributes: any;
  [additionalProperties: string]: any; // cleanest way to handler undefined properties
}

interface VerboseFrozenNode {
  original: string;
  normalizedInfo?: NodeNormalizerResultObj; // always supplied by Record, not required from user
  qNodeID: string;
  isSet: boolean;
  curie: string;
  UMLS: string[];
  semanticType: string[];
  semanticTypes: string[];
  label: string;
  apiLabel?: string;
  equivalentCuries?: string[]; // always supplied by Record, not required from user
  names: string[];
  attributes: any;
}

interface MinimalFrozenNode {
  original: string;
  normalizedInfo?: NodeNormalizerResultObj; // always supplied by Record, not required from user
  apiLabel?: string;
  [additionalProperties: string]: any; // cleanest way to handler undefined properties
}

type RecordPackage = [apiEdges: any[], ...frozenRecords: FrozenRecord[]];

interface MappedResponse {
  trapi_sources?: ProvenanceChainItem[];
  "edge-attributes"?: EdgeAttribute[];
  [mappedItems: string]: any;
}

interface Association {
  input_id?: string;
  input_type?: string;
  output_id?: string;
  output_type?: string;
  predicate: string;
  source?: string;
  api_name?: string;
  "x-translator"?: any;
  qualifiers?: BulkQualifiers;
  apiIsPrimaryKnowledgeSource?: boolean;
  [additionalProperties: string]: any;
}

interface QEdge {
  getInputNode(): QNode;
  getOutputNode(): QNode;
  getHashedEdgeRepresentation(): string;
  isReversed(): boolean;
  [additionalProperties: string]: any;
}

interface QNode {
  getID(): string;
  isSet(): boolean;
  [additionalProperties: string]: any;
}

interface EdgeAttribute {
  attribute_source: string;
  attribute_type_id: string;
  value: any;
  value_type_id: string;
  attributes?: EdgeAttribute[];
  [additionalProperties: string]: any;
}

interface Identifier {
  identifier: string;
  label?: string;
}

interface NodeNormalizerResultObj {
  primaryID: string;
  equivalentIDs: string[];
  label: string;
  labelAliases: string[];
  primaryTypes: string[];
  semanticTypes: string[];
  attributes: {
    [attributeID: string]: any;
  };
}

interface BulkQualifiers {
  [qualifierTypeID: string]: string; // qualifierValue
}

interface ProvenanceChainItem {
  resource_id: string;
  resource_role: string;
  upstream_resource_ids?: string[];
}
