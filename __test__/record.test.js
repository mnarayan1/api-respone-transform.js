/**
 * @jest-environment node
 */

const { Record } = require('../built/record');

describe("test record class", () => {

  const testFrozenRecord = {
    subject: {
      original:'originalThing0',
      qNodeID: 'n0',
      isSet: false,
      curie: 'prefix:1',
      UMLS: 'UMLSstring0',
      semanticType: 'gene',
      label: 'someLabel0',
      names: [
        'someName0'
      ],
      attributes: {}
    },
    object: {
      original:'originalThing1',
      qNodeID: 'n1',
      isSet: false,
      curie: 'prefix:2',
      UMLS: 'UMLSstring1',
      semanticType: 'gene',
      label: 'someLabel1',
      names: [
        'someName1'
      ],
      attributes: {}
    },
    predicate: 'somePredicate',
    publications: [
      'PMID:nopenotreal'
    ],
    mappedResponse: {
      edgeAttributes: [
        {
          attribute_source: 'someSource',
          attribute_type_id: 'someID',
          value: false,
          value_type_id: 'boolean',
        }
      ],
    },
    api: 'someAPI',
    apiInforesCurie: 'infores:something',
    metaEdgeSource: 'infores:somethingElse'
  }

  const testRecord = new Record(testFrozenRecord);
  describe("test initialization, record behavior", () => {

    test("Record produces fake apiEdge", () => {
      expect(testRecord.apiEdge.predicate).toEqual(testFrozenRecord.predicate)
      expect(testRecord.apiEdge.api_name).toEqual(testFrozenRecord.api)
      expect(testRecord.apiEdge.source).toEqual(testFrozenRecord.metaEdgeSource)
      expect(testRecord.apiEdge['x-translator'].infores).toEqual(testFrozenRecord.apiInforesCurie);
    });

    });

    test("Record produces fake qEdge", () => {
      expect(testRecord.qXEdge).toBeTruthy();
      expect(testRecord.qXEdge.getSubject().getID()).toEqual(testFrozenRecord.subject.qNodeID);
      expect(testRecord.qXEdge.getSubject().isSet()).toBeFalsy();
      expect(testRecord.qXEdge.getObject().isSet()).toBeFalsy();
      expect(testRecord.qXEdge.getObject().getID()).toEqual(testFrozenRecord.object.qNodeID);
      expect(testRecord.qXEdge.getHashedEdgeRepresentation()).toBeTruthy();

    });

    test("Record produces fake qNodes", () => {
      expect(testRecord.object.qNodeID).toEqual(testFrozenRecord.object.qNodeID);
      expect(testRecord.subject.normalizedInfo).toBeTruthy();
    });

  describe("test freeze/unfreeze", () => {
    test("frozenRecord return format", () => {
      expect(Record.freezeRecords([testRecord])).toHaveLength(1);
      expect(Record.freezeRecords([testRecord])[0].recordHash).toEqual(testRecord.recordHash);
      expect(Record.unfreezeRecords(Record.freezeRecords([testRecord]))[0].recordHash).toEqual(testRecord.recordHash);
    });
  });

});
