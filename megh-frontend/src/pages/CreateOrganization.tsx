import React, { useState } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
};

const CreateOrganizationModal: React.FC<Props> = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  if (!open) return null;

  const handleCreate = () => {
    if (!name.trim()) {
      alert("Please enter an organization name.");
      return;
    }
    onCreate(name, description);
    setName("");
    setDescription("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start pt-6 px-6 pb-2">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Create New Organization</h2>
            <p className="text-sm text-gray-500 mt-1">Add a new organization to your network management system</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition p-1"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6 pt-4 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1.5">Organization Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter organization name" 
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1.5">Description</label>
            <input 
              type="text" 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description" 
              className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm focus:bg-white focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-black/5"
            />
          </div>

          <div className="pt-2">
            <button 
              className="w-full bg-[#0a0f1c] text-white font-medium py-3 rounded-lg hover:bg-black transition"
              onClick={handleCreate}
            >
              Create Organization
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateOrganizationModal;
