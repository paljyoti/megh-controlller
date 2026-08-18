export interface ParsedTopic {
  serialNumber: string;
  type: string;
}

export const parseTopic = (topic: string): ParsedTopic | null => {
  const parts = topic.split("/");


  if (parts.length !== 3) return null;
  if (parts[0] !== "switch") return null;

  const serialNumber = parts[1];
  const type = parts[2];
  if (!serialNumber || !type) return null;

  return { serialNumber, type };

};


