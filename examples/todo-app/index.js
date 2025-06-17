/**
 * VerusDB Todo App Example
 * Simple todo application demonstrating VerusDB usage
 */

const VerusDB = require('../../index');
const readline = require('readline');

// Initialize database
const db = new VerusDB({
  path: './examples/todo-app/todos.vdb',
  encryptionKey: 'my-todo-secret-key'
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function initDatabase() {
  await db.init();
  
  // Create todos collection if it doesn't exist
  try {
    await db.createCollection('todos', {
      schema: {
        title: { type: 'string', required: true },
        description: { type: 'string' },
        completed: { type: 'boolean', default: false },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
        dueDate: { type: 'date' },
        tags: { type: 'array', default: [] },
        createdAt: { type: 'date', default: () => new Date() },
        updatedAt: { type: 'date', default: () => new Date() }
      },
      indexes: ['title', 'completed', 'priority']
    });
    console.log('✅ Database initialized');
  } catch (error) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }
}

async function addTodo() {
  return new Promise((resolve) => {
    rl.question('Enter todo title: ', async (title) => {
      if (!title.trim()) {
        console.log('❌ Title is required');
        resolve();
        return;
      }

      rl.question('Enter description (optional): ', async (description) => {
        rl.question('Enter priority (low/medium/high) [medium]: ', async (priority) => {
          rl.question('Enter due date (YYYY-MM-DD) (optional): ', async (dueDateStr) => {
            try {
              const todo = {
                title: title.trim(),
                description: description.trim() || undefined,
                priority: priority.trim() || 'medium',
                dueDate: dueDateStr.trim() ? new Date(dueDateStr.trim()) : undefined
              };

              const result = await db.insert('todos', todo);
              console.log(`✅ Todo added with ID: ${result._id}`);
            } catch (error) {
              console.log(`❌ Error adding todo: ${error.message}`);
            }
            resolve();
          });
        });
      });
    });
  });
}

async function listTodos() {
  try {
    const todos = await db.find('todos', {}, { sort: { createdAt: -1 } });
    
    if (todos.length === 0) {
      console.log('📝 No todos found');
      return;
    }

    console.log('\n📋 Your Todos:');
    console.log('================');
    
    todos.forEach((todo, index) => {
      const status = todo.completed ? '✅' : '⭕';
      const priority = {
        low: '🟢',
        medium: '🟡',
        high: '🔴'
      }[todo.priority] || '🟡';
      
      console.log(`${index + 1}. ${status} ${priority} ${todo.title}`);
      if (todo.description) {
        console.log(`   📄 ${todo.description}`);
      }
      if (todo.dueDate) {
        console.log(`   📅 Due: ${new Date(todo.dueDate).toLocaleDateString()}`);
      }
      console.log(`   🕒 Created: ${new Date(todo.createdAt).toLocaleString()}`);
      console.log('');
    });
  } catch (error) {
    console.log(`❌ Error listing todos: ${error.message}`);
  }
}

async function completeTodo() {
  return new Promise((resolve) => {
    rl.question('Enter todo ID to complete: ', async (id) => {
      try {
        const result = await db.update('todos', 
          { _id: id.trim() }, 
          { $set: { completed: true, updatedAt: new Date() } }
        );
        
        if (result.modifiedCount > 0) {
          console.log('✅ Todo marked as completed');
        } else {
          console.log('❌ Todo not found');
        }
      } catch (error) {
        console.log(`❌ Error completing todo: ${error.message}`);
      }
      resolve();
    });
  });
}

async function deleteTodo() {
  return new Promise((resolve) => {
    rl.question('Enter todo ID to delete: ', async (id) => {
      try {
        const result = await db.delete('todos', { _id: id.trim() });
        
        if (result.deletedCount > 0) {
          console.log('✅ Todo deleted');
        } else {
          console.log('❌ Todo not found');
        }
      } catch (error) {
        console.log(`❌ Error deleting todo: ${error.message}`);
      }
      resolve();
    });
  });
}

async function searchTodos() {
  return new Promise((resolve) => {
    rl.question('Enter search term: ', async (term) => {
      try {
        const todos = await db.find('todos', {
          $or: [
            { title: { $regex: term, $options: 'i' } },
            { description: { $regex: term, $options: 'i' } }
          ]
        });
        
        if (todos.length === 0) {
          console.log('🔍 No todos found matching your search');
          resolve();
          return;
        }

        console.log(`\n🔍 Found ${todos.length} todo(s):`);
        console.log('================');
        
        todos.forEach((todo, index) => {
          const status = todo.completed ? '✅' : '⭕';
          console.log(`${index + 1}. ${status} ${todo.title} (ID: ${todo._id})`);
        });
      } catch (error) {
        console.log(`❌ Error searching todos: ${error.message}`);
      }
      resolve();
    });
  });
}

async function showStats() {
  try {
    const stats = await db.getStats('todos');
    const allTodos = await db.find('todos');
    const completedTodos = await db.find('todos', { completed: true });
    const pendingTodos = await db.find('todos', { completed: false });
    
    console.log('\n📊 Todo Statistics:');
    console.log('==================');
    console.log(`📝 Total todos: ${stats.documentCount}`);
    console.log(`✅ Completed: ${completedTodos.length}`);
    console.log(`⭕ Pending: ${pendingTodos.length}`);
    console.log(`🗂️ Indexes: ${stats.indexes}`);
    
    // Priority breakdown
    const priorities = { low: 0, medium: 0, high: 0 };
    allTodos.forEach(todo => {
      priorities[todo.priority] = (priorities[todo.priority] || 0) + 1;
    });
    
    console.log('\n📊 Priority Breakdown:');
    console.log(`🟢 Low: ${priorities.low}`);
    console.log(`🟡 Medium: ${priorities.medium}`);
    console.log(`🔴 High: ${priorities.high}`);
  } catch (error) {
    console.log(`❌ Error getting stats: ${error.message}`);
  }
}

function showMenu() {
  console.log('\n🚀 VerusDB Todo App');
  console.log('==================');
  console.log('1. Add Todo');
  console.log('2. List Todos');
  console.log('3. Complete Todo');
  console.log('4. Delete Todo');
  console.log('5. Search Todos');
  console.log('6. Show Statistics');
  console.log('7. Start Admin Panel');
  console.log('0. Exit');
  console.log('');
}

async function startAdminPanel() {
  try {
    const server = await db.serveAdmin({ port: 4321 });
    console.log(`🌐 Admin panel started at ${server.url}`);
    console.log('Press any key to return to menu...');
    
    return new Promise((resolve) => {
      rl.question('', () => {
        resolve();
      });
    });
  } catch (error) {
    console.log(`❌ Failed to start admin panel: ${error.message}`);
  }
}

async function mainLoop() {
  while (true) {
    showMenu();
    
    const choice = await new Promise((resolve) => {
      rl.question('Choose an option: ', resolve);
    });

    switch (choice.trim()) {
      case '1':
        await addTodo();
        break;
      case '2':
        await listTodos();
        break;
      case '3':
        await completeTodo();
        break;
      case '4':
        await deleteTodo();
        break;
      case '5':
        await searchTodos();
        break;
      case '6':
        await showStats();
        break;
      case '7':
        await startAdminPanel();
        break;
      case '0':
        console.log('👋 Goodbye!');
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('❌ Invalid option. Please try again.');
    }
  }
}

async function main() {
  try {
    console.log('🔧 Initializing VerusDB Todo App...');
    await initDatabase();
    await mainLoop();
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  rl.close();
  process.exit(0);
});

// Start the application
main();